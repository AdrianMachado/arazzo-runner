import { runFromFile } from '../src/index'

const inputs = {
  createTodo: {
    userId: 1,
    title: 'Test todo',
    completed: false,
  },
}
runFromFile('./tests/basic.arz.json', { inputs }).then(({ status }) =>
  console.log('Spec run result', status)
)
