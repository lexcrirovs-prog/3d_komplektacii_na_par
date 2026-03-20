import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

function showError(root: HTMLElement, msg: string) {
  root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a2e;color:#ff6b6b;font-family:sans-serif;padding:20px;text-align:center"><div><h2 style="color:#fff;margin-bottom:16px">Ошибка</h2><p>' + msg + '</p></div></div>'
}

function init() {
  var root = document.getElementById('root')
  if (!root) {
    document.body.innerHTML = '<h1 style="color:red;padding:40px">Error: #root element not found</h1>'
    return
  }

  // WebGL check
  try {
    var canvas = document.createElement('canvas')
    var gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) {
      showError(root, 'Ваш браузер не поддерживает WebGL.<br>Попробуйте обновить браузер или включить аппаратное ускорение.')
      return
    }
  } catch (e) {
    showError(root, 'Не удалось инициализировать WebGL: ' + String(e))
    return
  }

  try {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  } catch (err: any) {
    showError(root, 'Ошибка запуска приложения:<br>' + (err && err.message ? err.message : String(err)))
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
