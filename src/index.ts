import fs from 'fs'
import yaml from 'js-yaml'
import $RefParser from '@apidevtools/json-schema-ref-parser'
import { evaluateWorkflow } from './utils/runner'
import { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types'
import {
  ArazzoExecutionConfig,
  ArazzoSpecification,
  EvaluationContext,
  Specs,
  WorkflowResult,
} from './interfaces'

// Run from test file
export async function runFromYAML(
  yamlString: string,
  config: ArazzoExecutionConfig
): Promise<WorkflowResult> {
  const arazzoSpec = yaml.load(yamlString)
  const dereferencedSpec = (await $RefParser.dereference(arazzoSpec as any, {
    dereference: {
      circular: 'ignore',
    },
  })) as unknown as ArazzoSpecification
  return run(dereferencedSpec, config)
}

export async function runFromJSON(
  jsonString: string,
  config: ArazzoExecutionConfig
): Promise<WorkflowResult> {
  const arazzoSpec = JSON.parse(jsonString)
  const dereferencedSpec = (await $RefParser.dereference(arazzoSpec as any, {
    dereference: {
      circular: 'ignore',
    },
  })) as unknown as ArazzoSpecification
  return run(dereferencedSpec, config)
}

// Run from test file
export async function runFromFile(
  path: string,
  config: ArazzoExecutionConfig
): Promise<WorkflowResult> {
  const testFile = await fs.promises.readFile(path)
  return path.endsWith('json')
    ? runFromJSON(testFile.toString(), config)
    : runFromYAML(testFile.toString(), config)
}

const parseOpenApiSpec = async (content: string) => {
  let isJson = false
  try {
    JSON.parse(content)
    isJson = true
  } catch (e) {
    isJson = false
  }
  if (isJson) {
    return JSON.parse(content) as OpenAPIV3_1.Document | OpenAPIV3.Document
  }
  return yaml.load(content) as OpenAPIV3_1.Document | OpenAPIV3.Document
}

// Run workflow
export async function run(
  arazzoSpec: ArazzoSpecification,
  config: ArazzoExecutionConfig
): Promise<WorkflowResult> {
  // First, validate the Arazzo specification
  // TODO: Validate the Arazzo spec against a schema

  // Next, gather up all the specs being referenced
  let specs: Specs = {}
  const allSpecs = await Promise.all(
    arazzoSpec.sourceDescriptions.map(async (sourceDescription) => {
      const { url, type } = sourceDescription
      if (type === 'openapi') {
        const specResponse = await fetch(url)
        const specContent = await specResponse.text()
        const spec = await parseOpenApiSpec(specContent)
        // We dereference the spec to resolve all $refs, will make parsing
        // through the spec easier
        const specDeref = (await $RefParser.dereference(spec as any, {
          dereference: {
            circular: 'ignore',
          },
        })) as OpenAPIV3_1.Document | OpenAPIV3.Document
        // TODO: Validate the OpenAPI spec against a schema
        return { url, spec: specDeref }
      }
      // TODO: Support referencing other workflows
      throw new Error(
        "Arazzo spec references in sourceDescriptions aren't supported yet"
      )
    })
  )
  allSpecs
    .filter(
      (
        res
      ): res is {
        url: string
        spec: OpenAPIV3_1.Document | OpenAPIV3.Document
      } => !!res
    )
    .forEach(({ url, spec }) => {
      if (spec) {
        specs[url] = spec
      }
    })

  // TODO: Iterate through the arazzo workflows and run reach one

  for (const workflow of arazzoSpec.workflows) {
    // The instantiate the evaluation context
    const workflowInputs = config.inputs[workflow.workflowId]
    // TODO: Validate the workflow inputs against the inputs schema
    let context: EvaluationContext = {
      inputs: workflowInputs,
      _workflowParameters: workflow.parameters,
    }
    const workflowResult = await evaluateWorkflow(workflow, context, specs)
    console.log(
      `Workflow ID ${workflow.workflowId} result: `,
      JSON.stringify(workflowResult)
    )
    if (
      workflowResult.status === 'error' ||
      workflowResult.status === 'failure'
    ) {
      return workflowResult
    }
  }

  return { status: 'success' }
}
