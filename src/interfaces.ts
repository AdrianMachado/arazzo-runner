import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'

export interface ArazzoSpecification {
  arazzo: string
  info: InfoObject
  sourceDescriptions: SourceDescriptionObject[]
  workflows: WorkflowObject[]
  components?: ComponentsObject
}

export interface InfoObject {
  title: string
  summary?: string
  description?: string
  version: string
}

export interface SourceDescriptionObject {
  name: string // SHOULD conform to the regular expression [A-Za-z0-9_\-]+
  url: string // MUST be in the form of a URI-reference as defined by RFC3986
  type?: 'openapi' | 'arazzo'
}

export interface WorkflowObject {
  workflowId: string // SHOULD conform to the regular expression [A-Za-z0-9_\-]+
  summary?: string
  description?: string
  inputs?: JSONSchema
  dependsOn?: string[] // List of workflowIds
  steps: StepObject[]
  successActions?: (SuccessActionObject | ReusableObject)[]
  failureActions?: (FailureActionObject | ReusableObject)[]
  outputs?: Record<string, string>
  parameters?: (ParameterObject | ReusableObject)[]
}

export interface StepObject {
  stepId: string // SHOULD conform to the regular expression [A-Za-z0-9_\-]+
  description?: string
  // Following 3 fields are mutually exclusive
  operationId?: string
  operationPath?: string // prefer operationId
  workflowId?: string
  parameters?: (ParameterObject | ReusableObject)[]
  requestBody?: RequestBodyObject
  successCriteria?: CriterionObject[]
  onSuccess?: (SuccessActionObject | ReusableObject)[]
  onFailure?: (FailureActionObject | ReusableObject)[]
  outputs?: Record<string, string>
}

export interface ParameterObject {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie' | 'body'
  value: string // Runtime expression or constant value
}

export interface SuccessActionObject {
  name: string
  type: 'end' | 'goto'
  workflowId?: string
  stepId?: string
  criteria?: CriterionObject[]
}

export interface FailureActionObject {
  name: string
  type: 'end' | 'retry' | 'goto'
  workflowId?: string
  stepId?: string
  retryAfter?: number
  retryLimit?: number
  criteria?: CriterionObject[]
}

export type CriterionObject =
  | {
      context: string
      condition: string
      type: 'jsonpath' | 'regex' | 'simple' | 'xpath'
    }
  | {
      condition: string
    }

export interface ReusableObject {
  reference: string
  value?: string
}

export interface RequestBodyObject {
  contentType: string
  payload: any
  replacements: PayloadReplacementObject[]
}

export interface PayloadReplacementObject {
  target: string
  value: any
}

export interface ComponentsObject {
  inputs?: Record<string, JSONSchema>
  parameters?: Record<string, ParameterObject>
  successActions?: Record<string, SuccessActionObject>
  failureActions?: Record<string, FailureActionObject>
}

export interface JSONSchema {
  type: string
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  required?: string[]
  additionalProperties?: boolean | JSONSchema
  format?: string
  enum?: any[]
  const?: any
  allOf?: JSONSchema[]
  anyOf?: JSONSchema[]
  oneOf?: JSONSchema[]
  not?: JSONSchema
  title?: string
  description?: string
  default?: any
  examples?: any[]
}

export interface EvaluationContext {
  url?: string
  method?: string
  statusCode?: number
  request?: {
    header: Record<string, string>
    query: Record<string, string>
    body: any
    // path: Record<string, string> NOT SUPPORTED
  }
  response?: {
    header: Record<string, string>
    body: any
    // path: Record<string, string> NOT SUPPORTED
  }
  inputs?: Record<string, any>
  outputs?: Record<string, any> // Workflow outputs
  steps?: Record<string, any> // Step outputs
  // $components?: Record<string, any>; NOT SUPPORTED
  // $sourceDescriptions: SourceDescriptionObject[]; NOT SUPPORTED
  // NOTE: Prefixed with _ to avoid people accidentally writing expressions to
  // access this properties
  _workflowParameters: (ParameterObject | ReusableObject)[] | undefined
}

export type Specs = Record<
  string,
  OpenAPIV3.Document<{}> | OpenAPIV3_1.Document<{}>
>

export interface ErrorResult {
  status: 'error'
  errorMessage: string
}

export interface SuccessResult {
  status: 'success'
}

export interface FailureResult {
  status: 'failure'
  reason: string
}

export type WorkflowResult = SuccessResult | ErrorResult | FailureResult
export interface ArazzoExecutionConfig {
  inputs: ArazzoSpecInputs
}
// Map of workflowId to inputs
export type ArazzoSpecInputs = Record<string, Record<string, any>>
