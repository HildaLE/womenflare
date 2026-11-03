const tokenKey = 'womenflare-admin-token'
const labels = ['A', 'B', 'C']
let token = sessionStorage.getItem(tokenKey) || ''
let questions = []
let resources = []
let session = null
let poller = null

const byId = (id) => document.getElementById(id)
const loginView = byId('login-view')
const dashboard = byId('dashboard')
const notice = byId('notice')
const dialog = byId('question-dialog')
const resourceDialog = byId('resource-dialog')

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const error = new Error(body?.error?.message || 'Une erreur est survenue.')
    error.status = response.status
    throw error
  }
  return response.status === 204 ? undefined : response.json()
}

function setAuthenticated(authenticated) {
  loginView.hidden = authenticated
  dashboard.hidden = !authenticated
  if (!authenticated && poller) clearInterval(poller)
}

function setNotice(message, error = false) {
  notice.textContent = message
  notice.classList.toggle('error', error)
}

function renderSession() {
  byId('phase').textContent = session?.phase || '…'
  byId('players').textContent = String(session?.playersCount || 0)
  byId('question-progress').textContent = session && session.questionIndex >= 0 ? `${session.questionIndex + 1}/${session.questionCount}` : '—'
  byId('start-session').disabled = session?.phase !== 'waiting'
  byId('next-session').disabled = session?.phase !== 'checkpoint'
  byId('next-session').textContent = 'Question suivante'
}

function createButton(label, className, onClick) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.className = className
  button.addEventListener('click', onClick)
  return button
}

function renderQuestions() {
  const list = byId('question-list')
  list.replaceChildren()
  byId('question-count').textContent = `(${questions.length})`
  for (const question of questions) {
    const article = document.createElement('article')
    const number = document.createElement('b')
    number.textContent = String(question.position)
    const body = document.createElement('div')
    const category = document.createElement('small')
    category.textContent = question.category
    const prompt = document.createElement('h3')
    prompt.textContent = question.prompt
    const answer = document.createElement('p')
    answer.textContent = `Réponse : ${labels[question.answerIndex]} · ${question.options[question.answerIndex]}`
    body.append(category, prompt, answer)
    article.append(
      number,
      body,
      createButton('Modifier', 'secondary', () => openEditor(question)),
      createButton('Supprimer', 'text-danger', () => void removeQuestion(question)),
    )
    list.append(article)
  }
}

function renderResources() {
  const list = byId('resource-list')
  list.replaceChildren()
  byId('resource-count').textContent = `(${resources.length})`
  for (const resource of resources) {
    const article = document.createElement('article')
    const number = document.createElement('b')
    number.textContent = String(resource.sortOrder)
    const body = document.createElement('div')
    const type = document.createElement('small')
    type.textContent = resource.type
    const name = document.createElement('h3')
    name.textContent = resource.name
    const description = document.createElement('p')
    description.textContent = resource.description
    const details = document.createElement('p')
    details.className = 'resource-details'
    details.textContent = resource.phone ? `${resource.phone} · ${resource.url}` : resource.url
    body.append(type, name, description, details)
    article.append(
      number,
      body,
      createButton('Modifier', 'secondary', () => openResourceEditor(resource)),
      createButton('Supprimer', 'text-danger', () => void removeResource(resource)),
    )
    list.append(article)
  }
}

async function loadAll() {
  try {
    const [nextSession, questionData, resourceData] = await Promise.all([
      request('/api/admin/session/state'),
      request('/api/admin/questions'),
      request('/api/admin/resources'),
    ])
    session = nextSession
    questions = questionData.questions
    resources = resourceData.resources
    renderSession()
    renderQuestions()
    renderResources()
    setNotice('')
  } catch (error) {
    if (error.status === 401) logout()
    else setNotice(error.message, true)
  }
}

async function refreshSession() {
  try {
    session = await request('/api/admin/session/state')
    renderSession()
  } catch (error) {
    if (error.status === 401) logout()
    else setNotice(error.message, true)
  }
}

function beginPolling() {
  if (poller) clearInterval(poller)
  poller = setInterval(() => void refreshSession(), 1000)
}

function logout() {
  token = ''
  sessionStorage.removeItem(tokenKey)
  setAuthenticated(false)
}

byId('login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const submit = event.currentTarget.querySelector('button[type="submit"]')
  const errorNode = byId('login-error')
  submit.disabled = true
  errorNode.textContent = ''
  try {
    const data = await request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: byId('email').value, password: byId('password').value }),
    })
    token = data.token
    sessionStorage.setItem(tokenKey, token)
    byId('password').value = ''
    setAuthenticated(true)
    await loadAll()
    beginPolling()
  } catch (error) {
    errorNode.textContent = error.message
  } finally {
    submit.disabled = false
  }
})

byId('logout').addEventListener('click', logout)

async function sessionAction(action) {
  setNotice('')
  try {
    session = await request(`/api/admin/session/${action}`, { method: 'POST' })
    renderSession()
    setNotice(action === 'start' ? 'Quiz lancé.' : action === 'next' ? 'Étape suivante lancée.' : 'Session réinitialisée.')
  } catch (error) {
    setNotice(error.message, true)
  }
}

byId('start-session').addEventListener('click', () => void sessionAction('start'))
byId('next-session').addEventListener('click', () => void sessionAction('next'))
byId('reset-session').addEventListener('click', () => {
  if (confirm('Réinitialiser la session et supprimer tous les participants ?')) void sessionAction('reset')
})

function showContentPanel(panel) {
  const showQuestions = panel === 'questions'
  byId('questions-panel').hidden = !showQuestions
  byId('resources-panel').hidden = showQuestions
  byId('questions-tab').classList.toggle('active', showQuestions)
  byId('resources-tab').classList.toggle('active', !showQuestions)
}

byId('questions-tab').addEventListener('click', () => showContentPanel('questions'))
byId('resources-tab').addEventListener('click', () => showContentPanel('resources'))

function openEditor(question) {
  byId('dialog-title').textContent = question ? `Question ${question.position}` : 'Nouvelle question'
  byId('question-id').value = question?.id || ''
  byId('prompt').value = question?.prompt || ''
  document.querySelectorAll('.option').forEach((input, index) => { input.value = question?.options[index] || '' })
  byId('answer-index').value = String(question?.answerIndex || 0)
  byId('position').value = String(question?.position || questions.length + 1)
  byId('category').value = question?.category || ''
  byId('explanation').value = question?.explanation || ''
  byId('form-error').textContent = ''
  dialog.showModal()
}

byId('new-question').addEventListener('click', () => openEditor(null))
byId('close-dialog').addEventListener('click', () => dialog.close())
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close() })

byId('question-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const id = byId('question-id').value
  const submit = event.currentTarget.querySelector('button[type="submit"]')
  const payload = {
    prompt: byId('prompt').value,
    options: [...document.querySelectorAll('.option')].map((input) => input.value),
    answerIndex: Number(byId('answer-index').value),
    position: Number(byId('position').value),
    category: byId('category').value,
    explanation: byId('explanation').value,
  }
  submit.disabled = true
  byId('form-error').textContent = ''
  try {
    await request(id ? `/api/admin/questions/${id}` : '/api/admin/questions', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    })
    dialog.close()
    await loadAll()
    setNotice('Question enregistrée.')
  } catch (error) {
    byId('form-error').textContent = error.message
  } finally {
    submit.disabled = false
  }
})

async function removeQuestion(question) {
  if (!confirm(`Supprimer la question ${question.position} ?`)) return
  try {
    await request(`/api/admin/questions/${question.id}`, { method: 'DELETE' })
    await loadAll()
    setNotice('Question supprimée.')
  } catch (error) {
    setNotice(error.message, true)
  }
}

function openResourceEditor(resource) {
  byId('resource-dialog-title').textContent = resource ? 'Modifier la ressource' : 'Nouvelle ressource'
  byId('resource-id').value = resource?.id || ''
  byId('resource-name').value = resource?.name || ''
  byId('resource-description').value = resource?.description || ''
  byId('resource-url').value = resource?.url || ''
  byId('resource-phone').value = resource?.phone || ''
  byId('resource-order').value = String(resource?.sortOrder ?? resources.length + 1)
  byId('resource-type').value = resource?.type || ''
  byId('resource-form-error').textContent = ''
  resourceDialog.showModal()
}

byId('new-resource').addEventListener('click', () => openResourceEditor(null))
byId('close-resource-dialog').addEventListener('click', () => resourceDialog.close())
resourceDialog.addEventListener('click', (event) => { if (event.target === resourceDialog) resourceDialog.close() })

byId('resource-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const id = byId('resource-id').value
  const submit = event.currentTarget.querySelector('button[type="submit"]')
  const payload = {
    name: byId('resource-name').value,
    description: byId('resource-description').value,
    url: byId('resource-url').value,
    phone: byId('resource-phone').value,
    sortOrder: Number(byId('resource-order').value),
    type: byId('resource-type').value,
  }
  submit.disabled = true
  byId('resource-form-error').textContent = ''
  try {
    await request(id ? `/api/admin/resources/${id}` : '/api/admin/resources', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    })
    resourceDialog.close()
    await loadAll()
    showContentPanel('resources')
    setNotice('Ressource enregistrée.')
  } catch (error) {
    byId('resource-form-error').textContent = error.message
  } finally {
    submit.disabled = false
  }
})

async function removeResource(resource) {
  if (!confirm(`Supprimer la ressource « ${resource.name} » ?`)) return
  try {
    await request(`/api/admin/resources/${resource.id}`, { method: 'DELETE' })
    await loadAll()
    showContentPanel('resources')
    setNotice('Ressource supprimée.')
  } catch (error) {
    setNotice(error.message, true)
  }
}

if (token) {
  setAuthenticated(true)
  void loadAll()
  beginPolling()
} else setAuthenticated(false)
