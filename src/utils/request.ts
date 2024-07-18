import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'
import { parseValue, parseValueRecursive } from './expression'
import {
  EvaluationContext,
  ParameterObject,
  ReusableObject,
  RequestBodyObject,
  ErrorResult,
} from '../interfaces'

export const executeRequest = async (
  stepId: string,
  context: EvaluationContext,
  operationObject: OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject,
  parentSpec: OpenAPIV3.Document | OpenAPIV3_1.Document,
  method: OpenAPIV3.HttpMethods,
  path: string,
  parameters?: (ParameterObject | ReusableObject)[],
  requestBody?: RequestBodyObject
): Promise<{ status: 'success'; response: Response } | ErrorResult> => {
  // TODO: Eventually use the operationObject to validate the parameters
  // provided. Ex. Does the request body conform to the schema? Are all the
  // required parameters provided?

  // For now, we'll just construct the request and send it.
  const parametersResult = parseParameters(stepId, context, parameters)
  if (parametersResult.status === 'error') {
    return parametersResult
  }
  const workflowParameterResult = parseParameters(
    stepId,
    context,
    context._workflowParameters
  )
  if (workflowParameterResult.status === 'error') {
    return workflowParameterResult
  }

  const operationParameters = {
    path: {
      ...workflowParameterResult.parsedParameters.path,
      ...parametersResult.parsedParameters.path,
    },
    query: {
      ...workflowParameterResult.parsedParameters.query,
      ...parametersResult.parsedParameters.query,
    },
    header: {
      ...workflowParameterResult.parsedParameters.header,
      ...parametersResult.parsedParameters.header,
    },
    cookie: {
      ...workflowParameterResult.parsedParameters.cookie,
      ...parametersResult.parsedParameters.cookie,
    },
    body: {
      ...workflowParameterResult.parsedParameters.body,
      ...parametersResult.parsedParameters.body,
    },
  }

  const requestBodyResult = getOperationRequestBody(
    stepId,
    context,
    requestBody
  )
  if (requestBodyResult.status === 'error') {
    return requestBodyResult
  }
  // We need a URL to execute against, choose the first one
  // TODO: Potentially make this configurable
  if (!parentSpec.servers || !parentSpec.servers[0]) {
    return {
      status: 'error',
      errorMessage: `Servers are required in the spec. Step ID: ${stepId}`,
    }
  }

  // Replace path params
  for (const parameter in operationParameters.path) {
    path = path.replace(`{${parameter}}`, operationParameters.path[parameter])
  }

  // Construct query params
  const search = new URLSearchParams()
  for (const parameter in operationParameters.query) {
    search.set(parameter, operationParameters.query[parameter])
  }
  if (requestBodyResult.operationRequestBody && requestBody) {
    operationParameters.header['Content-Type'] = requestBody.contentType
  }
  const requestUrl = `${parentSpec.servers[0].url}${path}${search.toString()}`
  try {
    const response = await fetch(requestUrl, {
      method: method.toUpperCase(),
      headers: operationParameters.header,
      body: requestBodyResult.operationRequestBody
        ? JSON.stringify(requestBodyResult.operationRequestBody)
        : undefined,
    })
    const responseText = await response.clone().text()
    if (!response.ok) {
      console.error(
        `Error in request to ${requestUrl}: ${response.status} - ${response.statusText} - ${responseText}`
      )
    }
    return { status: 'success', response }
  } catch (e) {
    return {
      status: 'error',
      errorMessage: (e as Error).message,
    }
  }
}

const parseParameters = (
  stepId: string,
  context: EvaluationContext,
  parameters: (ParameterObject | ReusableObject)[] | undefined
):
  | {
      status: 'success'
      parsedParameters: Record<
        'path' | 'query' | 'header' | 'cookie' | 'body',
        Record<string, any>
      >
    }
  | ErrorResult => {
  let parsedParameters: Record<
    'path' | 'query' | 'header' | 'cookie' | 'body',
    Record<string, any>
  > = { body: {}, cookie: {}, header: {}, path: {}, query: {} }
  if (!parameters) {
    return { status: 'success', parsedParameters }
  }
  for (const parameter of parameters) {
    if ('reference' in parameter) {
      return {
        status: 'error',
        errorMessage: `References are not supported in parameters yet. Step ID: ${stepId}`,
      }
    }
    const { name, value, in: location } = parameter
    if (location === 'cookie' || location === 'body') {
      return {
        status: 'error',
        errorMessage: `${location} parameter location is not supported yet. Step ID: ${stepId}`,
      }
    }
    parsedParameters[location][name] = parseValue(value, context)
  }
  return { status: 'success', parsedParameters }
}

const getOperationRequestBody = (
  stepId: string,
  context: EvaluationContext,
  requestBody: RequestBodyObject | undefined
):
  | {
      status: 'success'
      operationRequestBody: any
    }
  | ErrorResult => {
  let operationRequestBody: any
  if (!requestBody) {
    return { status: 'success', operationRequestBody: undefined }
  }
  const { contentType, payload, replacements } = requestBody
  if (replacements) {
    return {
      status: 'error',
      errorMessage: `Replacements are not supported in request body yet. Step ID: ${stepId}`,
    }
  }
  if (contentType === 'application/xml') {
    return {
      status: 'error',
      errorMessage: `application/xml request body content type is not supported yet. Step ID: ${stepId}`,
    }
  }
  if (contentType === 'application/x-www-form-urlencoded') {
    if (typeof payload === 'string') {
      return {
        status: 'error',
        errorMessage: `application/x-www-form-urlencoded request body should be an object. String form data is not currently supported. Step ID: ${stepId}`,
      }
    }
    if (typeof payload !== 'object') {
      return {
        status: 'error',
        errorMessage: `application/x-www-form-urlencoded request body should be an object. Step ID: ${stepId}`,
      }
    }
    operationRequestBody = Object.entries(payload).reduce(
      (acc, [key, value]) => {
        acc[key] = parseValue(value as string, context)
        return acc
      },
      {} as Record<string, any>
    )
    return { status: 'success', operationRequestBody }
  }

  if (contentType === 'application/json') {
    if (typeof payload === 'string') {
      return {
        status: 'error',
        errorMessage: `application/json request body should be an object. JSON template is not currently supported. Step ID: ${stepId}`,
      }
    }
    if (typeof payload !== 'object') {
      return {
        status: 'error',
        errorMessage: `application/json request body should be an object. Step ID: ${stepId}`,
      }
    }
    operationRequestBody = Object.entries(payload).reduce(
      (acc, [key, value]) => {
        acc[key] = parseValueRecursive(value, context)
        return acc
      },
      {} as Record<string, any>
    )
    return { status: 'success', operationRequestBody }
  }
  return {
    status: 'error',
    errorMessage: `Content type ${contentType} is not supported. Step ID: ${stepId}`,
  }
}
