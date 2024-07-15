import {
  WorkflowObject,
  EvaluationContext,
  Specs,
  WorkflowResult,
  StepObject,
  SuccessResult,
  FailureResult,
  ErrorResult,
} from '../interfaces'
import { sleep } from './common'
import { evaluateWorkflowStep } from './step'

/**
 *
 * @param workflow The Arazzo workflow object
 * @param context Evaluation context, assumed to contain the workflow's inputs
 * under $inputs and parameters under _workflowParameters
 * @returns
 */
export const evaluateWorkflow = async (
  workflow: WorkflowObject,
  context: EvaluationContext,
  specs: Specs
): Promise<WorkflowResult> => {
  const { workflowId, steps, successActions, failureActions } = workflow
  if (workflow.dependsOn) {
    return {
      status: 'error',
      errorMessage: `DependsOn is not supported yet. Workflow ID: ${workflowId}`,
    }
  }
  if (successActions || failureActions) {
    return {
      status: 'error',
      errorMessage: `SuccessActions and FailureActions are not supported yet. Please add onSuccess and onFailure to the steps instead. Workflow ID: ${workflowId}`,
    }
  }

  let stepIndex = 0
  let retryCount = 0
  let retryLimit: number | undefined = undefined
  while (stepIndex != null) {
    if (retryLimit) {
      retryCount++
      if (retryCount >= retryLimit) {
        return {
          status: 'failure',
          reason: `Retry limit exceeded for workflow ${workflowId}`,
        }
      }
    }

    const stepOrchestrationResult = await orchestrateWorkflowStep(
      workflowId,
      stepIndex,
      steps,
      context,
      specs
    )
    switch (stepOrchestrationResult.status) {
      case 'error':
      case 'success':
      case 'failure':
        return stepOrchestrationResult
      case 'incomplete':
        if ('nextStepIndex' in stepOrchestrationResult) {
          stepIndex = stepOrchestrationResult.nextStepIndex
          // Reset vars if the retry succeeded
          retryLimit = undefined
          retryCount = 0
          continue
        }
        if (retryLimit === undefined) {
          retryLimit = stepOrchestrationResult.retryLimit
          retryCount = 0
        }
        await sleep(stepOrchestrationResult.retryAfter)
        // We retry the current step by default since stepIndex is not updated
        continue
    }
  }

  return {
    status: 'error',
    errorMessage: 'EvaluateWorkflow reached an unexpected state',
  }
}

const orchestrateWorkflowStep = async (
  workflowId: string,
  stepIndex: number,
  steps: StepObject[],
  context: EvaluationContext,
  specs: Specs
): Promise<
  | SuccessResult
  | FailureResult
  | { status: 'incomplete'; nextStepIndex: number }
  | { status: 'incomplete'; retryLimit: number; retryAfter: number }
  | ErrorResult
> => {
  if (stepIndex >= steps.length) {
    return { status: 'success' }
  }
  const step = steps[stepIndex]
  const stepResult = await evaluateWorkflowStep(step, context, specs)
  if (stepResult.status === 'error') {
    return stepResult
  }

  if (stepResult.stepOutputs) {
    if (!context.steps) {
      context.steps = {}
    }
    context.steps[step.stepId] = { outputs: stepResult.stepOutputs }
  }

  if (!('nextAction' in stepResult)) {
    // Spec defaults
    if (stepResult.status === 'success') {
      // Default to proceeding to next step
      return { status: 'incomplete', nextStepIndex: stepIndex + 1 }
    }
    // Default to 'end' on failure
    return {
      status: 'failure',
      reason: `Step ${step.stepId} failed`,
    }
  }

  if (stepResult.nextAction === 'end') {
    return stepResult.status === 'success'
      ? { status: stepResult.status }
      : { status: 'failure', reason: `Step ${step.stepId} failed` }
  }

  if (stepResult.nextAction === 'goto') {
    const { nextStepId } = stepResult
    const nextStepIndex = steps.findIndex((step) => step.stepId === nextStepId)
    if (nextStepIndex === -1) {
      return {
        status: 'error',
        errorMessage: `Step ${nextStepId} not found. Workflow ID: ${workflowId}`,
      }
    }
    stepIndex = nextStepIndex
    return { status: 'incomplete', nextStepIndex }
  }

  const retryAfter = (stepResult.retryAfter || 0) * 1000 // Spec default
  const retryLimit = stepResult.retryLimit || 1 // Spec default
  return { status: 'incomplete', retryAfter, retryLimit }
}
