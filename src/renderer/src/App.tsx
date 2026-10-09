import { APP_NAME } from '../../shared/app-info'

export function App() {
  return (
    <main className="app">
      <h1>{APP_NAME}</h1>
      <p>Running on {window.marcdoc.platform}</p>
    </main>
  )
}
