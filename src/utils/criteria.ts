import { EvaluationContext, CriterionObject, ErrorResult } from '../interfaces'
import { evaluateComplexCondition } from './expression'

export const evaluateCriteria = (
  stepId: string,
  context: EvaluationContext,
  successCriteria: CriterionObject[]
): { status: 'success'; criteriaEvalResult: boolean } | ErrorResult => {
  for (const criterion of successCriteria) {
    const result = evaluateCriterion(stepId, context, criterion)
    if (result.status === 'error') {
      return result
    }
    // Stop executing once first failure is found
    if (!result.criterionEvalResult) {
      return { status: 'success', criteriaEvalResult: false }
    }
  }
  return { status: 'success', criteriaEvalResult: true }
}

const evaluateCriterion = (
  stepId: string,
  context: EvaluationContext,
  criteria: CriterionObject
): { status: 'success'; criterionEvalResult: boolean } | ErrorResult => {
  if ('type' in criteria) {
    return {
      status: 'error',
      errorMessage: `Criterion type ${criteria.type} is not supported yet. Use a simple condition instead. Step ID: ${stepId}`,
    }
  }
  // Assume type = simple as per spec
  const { condition } = criteria
  const criterionEvalResult = evaluateComplexCondition(condition, context)
  return { status: 'success', criterionEvalResult }
}
