import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

function init() {
  const root = document.getElementById('root')
  if (!root) {
    document.body.innerHTML = '<h1 style="color:red;padding:40px">Error: #root element not found</h1>'
    return
  }
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
