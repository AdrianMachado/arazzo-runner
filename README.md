# Arazzo Runner

Library to run [Arazzo](https://www.openapis.org/arazzo) specs. Library will consume your spec and a set of inputs to execute the associated workflows. Workflows will be executed serially, in order.

## Installation

### Local

```bash
npm install
npm run build
```

### npm (COMING SOON)

```bash
npm install @arazzo/runner
```

## Testing

Add your Arazzo test specs under `/tests` and modify [test.ts](./tests/test.ts) to include your spec.

```bash
npm run test
```

Terminal Output

```bash
Condition Failed: 404 == 200. Original expression: $statusCode == 200
Workflow ID createTodo result:  {"status":"failure","reason":"Step getTodo failed"}
Spec run result failure
```

## Usage

### Run workflow from file

YAML

```js
import { runFromFile } from '@arazzo/runner'
const inputs = {
  createTodo: {
    userId: 1,
    title: 'Test todo',
    completed: false,
  },
}
runFromFile('./examples/status.arz.yml', { inputs }).then(console.log)
```

JSON

```js
import { runFromFile } from '@arazzo/runner'
runFromFile('./examples/status.arz.json', { inputs }).then(console.log)
```

### Run workflow from code

```js
import { run } from '@arazzo/runner'

// Example workflow
const arazzoSpec = {
  arazzo: '1.0.0',
  info: {
    title: 'Simple Arazzo test',
    version: '1.0.0',
  },
  sourceDescriptions: [
    {
      name: 'Todo list API',
      url: 'https://white-buzzard-main-215278f.d2.zuplo.dev/openapi',
      type: 'openapi',
    },
  ],
  workflows: [
    {
      workflowId: 'createTodo',
      inputs: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title of the todo',
          },
        },
      },
      steps: [
        {
          stepId: 'createTodo',
          description: 'Create a new todo',
          operationId: 'f9e30d74-56ca-4f1e-bcb3-75fe305ea5e4',
          requestBody: {
            contentType: 'application/json',
            payload: {
              title: '$inputs.title',
            },
          },
          successCriteria: [
            {
              condition: '$statusCode == 201',
            },
          ],
          outputs: {
            todoId: '$response.body.id',
          },
        },
        {
          stepId: 'getTodo',
          description: 'Get the created todo',
          operationId: '7c8d2194-7b6f-49cd-b8ae-307eaecb017a',
          parameters: [
            {
              name: 'id',
              in: 'path',
              value: '$steps.createTodo.outputs.todoId',
            },
          ],
          successCriteria: [
            {
              condition: '$statusCode == 200',
            },
          ],
        },
      ],
    },
  ],
}

const inputs = {
  createTodo: {
    userId: 1,
    title: 'Test todo',
    completed: false,
  },
}

run(arazzoSpec, { inputs }).then(console.log)
// {"status":"failure","reason":"Step getTodo failed"}
```

## Limitation

Most limitations will be surfaced by utilizing properties/fields of the spec that aren't supported. Here are some major ones that come to mind;

- Arazzo specs and inputs are not currently validated
- OpenAPI specs are not currently validated
- Workflow outputs are not currently captured
- Replacement Object support
- Reusable Object support
- `regex`, `jsonpath`, and `xpath` criterion support (jsonpath expressions in 'simple' criterion still work)
- Cookies
- Anything to do with XML
