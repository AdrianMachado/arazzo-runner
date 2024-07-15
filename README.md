# Arazzo Runner

Library to run Arazzo specs

## Installation

```
npm install @arazzo/runner
```

## Usage

### Run workflow from file

YAML

```js
import { runFromFile } from '@arazzo/runner'
runFromFile('./examples/status.arz.yml').then(console.log)
```

JSON

```js
import { runFromFile } from '@arazzo/runner'
runFromFile('./examples/status.arz.json').then(console.log)
```

### Run workflow from config

```js
import { run } from '@stepci/runner'

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

run(arazzoSpec).then(console.log)
```
