import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'
import { executeRequest } from './request'
import { parseValue } from './expression'
import { evaluateCriteria } from './criteria'
import {
  StepObject,
  EvaluationContext,
  Specs,
  ErrorResult,
} from '../interfaces'

export const evaluateWorkflowStep = async (
  step: StepObject,
  context: EvaluationContext,
  specs: Specs
): Promise<
  | {
      status: 'success' | 'failure'
      stepOutputs?: Record<string, any>
      nextAction: 'end'
    }
  | {
      status: 'success' | 'failure'
      stepOutputs?: Record<string, any>
      nextAction: 'goto'
      nextStepId: string
    }
  | {
      status: 'failure'
      stepOutputs?: Record<string, any>
      nextAction: 'retry'
      retryAfter?: number
      retryLimit?: number
    }
  | {
      status: 'success' | 'failure'
      stepOutputs?: Record<string, any>
    }
  | ErrorResult
> => {
  const {
    stepId,
    operationId,
    operationPath,
    parameters,
    requestBody,
    successCriteria,
    outputs,
    onSuccess,
    onFailure,
  } = step
  if (!operationId || operationPath) {
    return {
      status: 'error',
      errorMessage: `Operation ID is required in Step ${stepId}. operationPath and workflowId are not currently supported.`,
    }
  }

  // Fetch the associated operation to be tested
  const { operationObject, parentSpec, method, path } =
    getOperationByOperationId(operationId, specs)
  if (!operationObject) {
    return {
      status: 'error',
      errorMessage: `Operation with ID ${operationId} not found in any of the specs. Step ID: ${stepId}`,
    }
  }

  // Test the operation with the provided inputs
  const responseResult = await executeRequest(
    stepId,
    context,
    operationObject,
    parentSpec,
    method,
    path,
    parameters,
    requestBody
  )
  if (responseResult.status === 'error') {
    return responseResult
  }

  // Enrich the context with the response
  const responseEnrichedContext = await getContextFromResponse(
    context,
    responseResult.response
  )

  // Parse outputs
  const stepOutputs = outputs
    ? getOutputsFromResponse(outputs, responseEnrichedContext)
    : {}

  // Evaluate the success criteria
  let isStepSuccessful: boolean | undefined = true
  if (successCriteria) {
    const criteriaResult = evaluateCriteria(
      stepId,
      responseEnrichedContext,
      successCriteria
    )
    if (criteriaResult.status === 'error') {
      return criteriaResult
    }
    isStepSuccessful = criteriaResult.criteriaEvalResult
  }

  if (isStepSuccessful === true && onSuccess) {
    // Execute onSuccess steps
    for (const successActionObject of onSuccess) {
      if ('reference' in successActionObject) {
        return {
          status: 'error',
          errorMessage: `References are not supported in onSuccess yet. Step ID: ${stepId}`,
        }
      }
      const {
        stepId: successStepId,
        type,
        workflowId,
        criteria: onSuccessCriteria,
      } = successActionObject
      if (workflowId) {
        return {
          status: 'error',
          errorMessage: `Workflow references are not supported in onSuccess yet. Step ID: ${stepId}`,
        }
      }

      const onSuccessCriteriaResult = onSuccessCriteria
        ? evaluateCriteria(stepId, responseEnrichedContext, onSuccessCriteria)
        : ({ status: 'success', criteriaEvalResult: true } as {
            status: 'success'
            criteriaEvalResult: boolean
          }) // Auto-pass if no criteria
      if (onSuccessCriteriaResult.status === 'error') {
        return onSuccessCriteriaResult
      }

      if (
        type === 'end' &&
        onSuccessCriteriaResult.criteriaEvalResult === true
      ) {
        return {
          status: 'success',
          stepOutputs,
          nextAction: 'end', // No next step
        }
      }
      if (
        type === 'goto' &&
        successStepId &&
        onSuccessCriteriaResult.criteriaEvalResult === true
      ) {
        return {
          status: 'success',
          stepOutputs,
          nextAction: 'goto',
          nextStepId: successStepId,
        }
      }
    }
    // If we don't pass any of the onSuccess steps' criteria, we'll just
    // continue to the next step
  }

  if (isStepSuccessful === false && onFailure) {
    for (const failureActionObject of onFailure) {
      if ('reference' in failureActionObject) {
        return {
          status: 'error',
          errorMessage: `References are not supported in onFailure yet. Step ID: ${stepId}`,
        }
      }
      const {
        type,
        workflowId,
        stepId: failureStepId,
        retryAfter,
        retryLimit,
        criteria: onFailureCriteria,
      } = failureActionObject
      if (workflowId) {
        return {
          status: 'error',
          errorMessage: `Workflow references are not supported in onFailure yet. Step ID: ${stepId}`,
        }
      }

      const onFailureCriteriaResult = onFailureCriteria
        ? evaluateCriteria(stepId, responseEnrichedContext, onFailureCriteria)
        : ({ status: 'success', criteriaEvalResult: true } as {
            status: 'success'
            criteriaEvalResult: boolean
          }) // Auto-pass if no criteria
      if (onFailureCriteriaResult.status === 'error') {
        return onFailureCriteriaResult
      }
      if (
        type === 'end' &&
        onFailureCriteriaResult.criteriaEvalResult === true
      ) {
        return {
          status: 'failure',
          stepOutputs,
          nextAction: 'end', // No next step
        }
      }
      if (
        type === 'goto' &&
        failureStepId &&
        onFailureCriteriaResult.criteriaEvalResult === true
      ) {
        return {
          status: 'failure',
          stepOutputs,
          nextAction: 'goto',
          nextStepId: failureStepId,
        }
      }

      if (
        type === 'retry' &&
        onFailureCriteriaResult.criteriaEvalResult === true
      ) {
        if (failureStepId) {
          return {
            status: 'error',
            errorMessage: `stepId is not supported in onFailure with failure action type = retry yet. Step ID: ${stepId}`,
          }
        }
        const retryAfterHeaderValue =
          responseResult.response.headers.get('Retry-After')
        return {
          status: 'failure',
          stepOutputs,
          nextAction: 'retry',
          retryAfter: retryAfterHeaderValue
            ? parseInt(retryAfterHeaderValue)
            : retryAfter,
          retryLimit,
        }
      }
    }
  }

  return {
    status: isStepSuccessful ? 'success' : 'failure',
    stepOutputs,
  }
}

const getOperationByOperationId = (
  operationId: string,
  specs: Specs
):
  | {
      method: OpenAPIV3.HttpMethods
      operationObject: OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject
      parentSpec: OpenAPIV3.Document | OpenAPIV3_1.Document
      path: string
    }
  | {
      method: undefined
      operationObject: undefined
      parentSpec: undefined
      path: undefined
    } => {
  let operationObject:
    | OpenAPIV3.OperationObject
    | OpenAPIV3_1.OperationObject
    | undefined = undefined
  let parentSpec: OpenAPIV3.Document | OpenAPIV3_1.Document | undefined =
    undefined
  let operationMethod: OpenAPIV3.HttpMethods | undefined = undefined
  let operationPath: string | undefined = undefined

  Object.entries(specs).forEach(([, spec]) => {
    if (parentSpec) return
    if (!spec.paths) return
    Object.entries(spec.paths).forEach(([path, pathObject]) => {
      if (parentSpec) return
      if (!pathObject) return
      const methods = [
        'get',
        'post',
        'put',
        'delete',
        'patch',
        'options',
        'head',
        'trace',
      ] as OpenAPIV3.HttpMethods[]
      methods.forEach((method) => {
        if (parentSpec) return
        const operation = pathObject[method]
        if (!operation) return
        if (operation.operationId === operationId) {
          operationMethod = method
          operationObject = operation
          parentSpec = spec
          operationPath = path
          return
        }
      })
    }) as OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject | undefined
  })
  return {
    method: operationMethod,
    operationObject,
    parentSpec,
    path: operationPath,
  }
}

const getContextFromResponse = async (
  currentContext: EvaluationContext,
  response: Response
): Promise<EvaluationContext> => {
  const newEvalContext = structuredClone(currentContext)
  newEvalContext.url = response.url
  newEvalContext.statusCode = response.status
  const headers = response.headers
  let responseBody = await response.clone().text()
  try {
    responseBody = JSON.parse(responseBody)
  } catch (e) {
    // Do nothing
  }
  let headersParsed: Record<string, string> = {}
  headers.forEach((value, key) => {
    headersParsed[key] = value
  })
  newEvalContext.response = {
    header: headersParsed,
    body: responseBody,
  }
  return newEvalContext
}

const getOutputsFromResponse = (
  outputs: Record<string, string>,
  context: EvaluationContext
) => {
  let outputsParsed: Record<string, any> = {}
  for (const [key, value] of Object.entries(outputs)) {
    outputsParsed[key] = parseValue(value, context)
  }
  return outputsParsed
}
