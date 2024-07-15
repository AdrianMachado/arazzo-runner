import jsonpath from 'jsonpath'
import { EvaluationContext } from '../interfaces'

// Function to parse and evaluate a single condition
function evaluateExpression(
  expression: string,
  context: EvaluationContext
): boolean {
  const match = expression.match(
    /(\$\w+(\.\w+)*(\[\d+\])?|\d+|true|false|null|".*?")\s*(==|!=|<=|>=|<|>|&&|\|\||!)\s*(\$\w+(\.\w+)*(\[\d+\])?|\d+|true|false|null|".*?")/
  )

  if (!match) {
    throw new Error(`Invalid expression: ${expression}`)
  }

  const [, leftOperand, , , operator, rightOperand] = match
  const leftValue = parseValue(leftOperand, context)
  const rightValue = parseValue(rightOperand, context)
  let evalResult: boolean
  switch (operator.trim()) {
    case '==':
      evalResult = leftValue == rightValue
      break
    case '!=':
      evalResult = leftValue != rightValue
      break
    case '>=':
      evalResult = leftValue >= rightValue
      break
    case '<=':
      evalResult = leftValue <= rightValue
      break
    case '>':
      evalResult = leftValue > rightValue
      break
    case '<':
      evalResult = leftValue < rightValue
      break
    case '&&':
      evalResult = leftValue && rightValue
      break
    case '||':
      evalResult = leftValue || rightValue
      break
    case '!':
      evalResult = !leftValue
      break
    default:
      throw new Error(`Unsupported operator: ${operator}`)
  }
  if (!evalResult) {
    console.error(
      `Condition Failed: ${leftValue} ${operator} ${rightValue}. Original expression: ${expression}`
    )
  }
  return evalResult
}

// TODO: Error handling when jsonpath query fails or throws an error
export function parseValue(operand: string, context: EvaluationContext): any {
  if (operand.startsWith('$')) {
    return jsonpath.query(context, operand.slice(1))[0]
  }
  if (operand.startsWith('"') && operand.endsWith('"')) {
    return operand.slice(1, -1)
  }
  if (operand.startsWith("'") && operand.endsWith("'")) {
    return operand.slice(1, -1)
  }
  if (operand === 'true') {
    return true
  }
  if (operand === 'false') {
    return false
  }
  if (operand === 'null') {
    return null
  }
  if (!isNaN(Number(operand))) {
    return Number(operand)
  }
  return operand
}

export function parseValueRecursive(
  operand: any,
  context: EvaluationContext
): any {
  if (typeof operand === 'string') {
    return parseValue(operand, context)
  }
  if (Array.isArray(operand)) {
    return operand.map((value) => parseValueRecursive(value, context))
  }
  if (typeof operand === 'object') {
    return Object.entries(operand).reduce((acc, [key, value]) => {
      acc[key] = parseValueRecursive(value, context)
      return acc
    }, {} as Record<string, any>)
  }
  return operand
}

// Function to evaluate complex conditions with logical grouping
export function evaluateComplexCondition(
  condition: string,
  context: EvaluationContext
): boolean {
  const evalCondition = (cond: string): boolean => {
    cond = cond.trim()
    if (cond.startsWith('(') && cond.endsWith(')')) {
      return evaluateComplexCondition(cond.slice(1, -1), context)
    }
    return evaluateExpression(cond, context)
  }

  const andConditions = condition.split(/\s*&&\s*/).map((cond) => cond.trim())

  return andConditions.every((andCond) => {
    const orConditions = andCond.split(/\s*\|\|\s*/).map((cond) => cond.trim())
    return orConditions.some(evalCondition)
  })
}
