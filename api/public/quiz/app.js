const playerKey = 'womenflare-player-id'
const labels = ['A', 'B', 'C']
const views = ['join-view', 'connecting-view', 'waiting-view', 'question-view', 'board-view']

let playerId = readPlayerId()
let state = null
let connectionError = ''
let joining = false
let joinError = ''
// Id of the question for which an answer was sent; keeps the options locked until the next question.
let answeredQuestionId = null
let answerError = ''
let polling = false
let rendered = ''
let resourcesLoaded = false
let resourcesLoading = false

const byId = (id) => document.getElementById(id)

// Storage can be unavailable (private browsing, blocked cookies): the quiz still works until the tab is reloaded.
function readPlayerId() {
  try {
    return localStorage.getItem(playerKey)
  } catch {
    return null
  }
}

function storePlayerId(id) {
  try {
    if (id) localStorage.setItem(playerKey, id)
    else localStorage.removeItem(playerKey)
  } catch {
    // Ignored on purpose, see readPlayerId.
  }
}

class ApiError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

async function request(path, body) {
  let response
  try {
    response = await fetch(path, body
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : undefined)
  } catch {
    throw new ApiError('Connexion interrompue, nouvelle tentative…', 'network')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    throw new ApiError(data?.error?.message || 'Une erreur est survenue.', data?.error?.code || '')
  }
  return data
}

function plural(count, one, many) {
  return count > 1 ? many : one
}

function setState(next) {
  if (next.question?.id !== state?.question?.id) {
    answeredQuestionId = null
    answerError = ''
  }
  state = next
}

function leaveSession() {
  playerId = null
  state = null
  connectionError = ''
  answeredQuestionId = null
  answerError = ''
  storePlayerId(null)
}

function currentView() {
  if (!playerId) return 'join-view'
  if (!state) return 'connecting-view'
  if (state.phase === 'waiting') return 'waiting-view'
  if (state.phase === 'checkpoint' || state.phase === 'finished') return 'board-view'
  return 'question-view'
}

function renderCountdown() {
  if (!state || state.phase !== 'question') return
  const remaining = Math.max(0, Math.ceil(((state.deadline ?? Date.now()) - Date.now()) / 1000))
  byId('countdown-number').textContent = String(remaining)
}

function renderQuestion() {
  const question = state.question
  const isReveal = state.phase === 'reveal'
  const locked = isReveal || state.hasAnswered || answeredQuestionId === question?.id
  byId('category').textContent = question?.category || ''
  byId('countdown').hidden = isReveal
  byId('question-step').textContent = isReveal
    ? `Question ${state.questionIndex + 1} · réponse`
    : `Question ${state.questionIndex + 1} sur ${state.questionCount}`
  byId('prompt').textContent = question?.prompt || ''
  byId('progress').hidden = isReveal
  byId('progress-bar').style.width = `${((state.questionIndex + 1) / state.questionCount) * 100}%`

  const list = byId('answers')
  list.replaceChildren()
  for (const [index, option] of (question?.options || []).entries()) {
    const correct = isReveal && index === state.reveal?.answerIndex
    const wrong = isReveal && index === state.reveal?.selectedIndex && !correct
    const button = document.createElement('button')
    button.type = 'button'
    button.disabled = locked
    if (correct) button.className = 'correct'
    if (wrong) button.className = 'wrong'
    const letter = document.createElement('b')
    letter.textContent = labels[index]
    const text = document.createElement('span')
    text.textContent = option
    button.append(letter, text)
    if (correct || wrong) button.setAttribute('aria-label', `${labels[index]}. ${option} (${correct ? 'bonne réponse' : 'votre réponse'})`)
    button.addEventListener('click', () => void answer(index))
    list.append(button)
  }

  byId('saved').hidden = isReveal || !state.hasAnswered
  byId('answer-error').textContent = state.hasAnswered ? '' : answerError
  byId('explanation').hidden = !isReveal
  byId('explanation-text').textContent = state.reveal?.explanation || ''
  renderCountdown()
}

function renderBoard() {
  const finished = state.phase === 'finished'
  const answered = state.questionIndex + 1
  byId('board-eyebrow').textContent = finished
    ? 'Classement final'
    : `Après ${answered} ${plural(answered, 'question', 'questions')}`
  byId('board-title').textContent = finished ? 'Merci d’avoir participé.' : 'Le podium se dessine.'

  const list = byId('ranking')
  list.replaceChildren()
  for (const entry of (state.leaderboard || []).slice(0, 3)) {
    const item = document.createElement('li')
    item.className = `rank-${entry.rank}`
    const rank = document.createElement('b')
    rank.textContent = String(entry.rank)
    const name = document.createElement('span')
    name.textContent = entry.name
    const score = document.createElement('em')
    score.textContent = `${entry.score} pts`
    item.append(rank, name, score)
    list.append(item)
  }

  const own = byId('own-rank')
  own.hidden = !state.ownRank
  if (state.ownRank) {
    const rank = document.createElement('strong')
    rank.textContent = `#${state.ownRank}`
    own.replaceChildren('Votre position : ', rank, ` · ${state.ownScore} ${plural(state.ownScore, 'point', 'points')}`)
  }

  const explanation = state.question ? state.reveal?.explanation : ''
  byId('board-explanation').hidden = !explanation
  byId('board-explanation-text').textContent = explanation || ''
}

// Polling runs twice per second: only touch the DOM when something visible changed,
// so buttons are not rebuilt under the participant's finger.
function render() {
  const signature = JSON.stringify([playerId, state, connectionError, joining, joinError, answeredQuestionId, answerError])
  if (signature === rendered) return
  rendered = signature

  const view = currentView()
  for (const id of views) byId(id).hidden = id !== view
  byId('connection-error').textContent = playerId ? connectionError : ''

  if (view === 'join-view') {
    byId('join-button').disabled = joining
    byId('join-button').textContent = joining ? 'Connexion…' : 'Rejoindre'
    byId('join-error').textContent = joinError
  } else if (view === 'waiting-view') {
    const people = state.playersCount
    byId('waiting-note').textContent = `L’animation commencera bientôt. ${people} ${plural(people, 'participant connecté', 'participants connectés')}.`
  } else if (view === 'question-view') {
    renderQuestion()
  } else if (view === 'board-view') {
    renderBoard()
  }
}

async function refresh() {
  if (!playerId || polling || document.hidden) return
  const id = playerId
  polling = true
  try {
    const next = await request(`/api/session/state?playerId=${encodeURIComponent(id)}`)
    if (id === playerId) {
      setState(next)
      connectionError = ''
    }
  } catch (error) {
    if (id === playerId) {
      // The organiser reset the session: this participant no longer exists, back to the join form.
      if (error.code === 'player_not_found') leaveSession()
      else connectionError = error.message
    }
  } finally {
    polling = false
  }
  render()
}

async function join(event) {
  event.preventDefault()
  const name = byId('name').value.trim()
  if (!name || joining) return
  joining = true
  joinError = ''
  render()
  try {
    const result = await request('/api/session/join', { name })
    playerId = result.playerId
    storePlayerId(playerId)
    setState(result.state)
    byId('name').value = ''
  } catch (error) {
    joinError = error.message
  } finally {
    joining = false
  }
  render()
}

async function answer(optionIndex) {
  const questionId = state?.question?.id
  if (!playerId || questionId === undefined || state.phase !== 'question' || state.hasAnswered || answeredQuestionId === questionId) return
  answeredQuestionId = questionId
  answerError = ''
  render()
  try {
    await request('/api/session/answer', { playerId, optionIndex })
    void refresh()
  } catch (error) {
    if (state?.question?.id !== questionId) return
    if (error.code === 'player_not_found') leaveSession()
    else {
      // Unlock the options so the participant can retry, unless the answer is already recorded.
      if (error.code !== 'already_answered') answeredQuestionId = null
      answerError = error.message
    }
    render()
  }
}

function renderResources(resources) {
  const list = byId('resource-list')
  list.replaceChildren()
  for (const [index, resource] of resources.entries()) {
    const safeUrl = /^https?:\/\//i.test(resource.url || '')
    const row = document.createElement(safeUrl ? 'a' : 'div')
    row.className = 'resource'
    if (safeUrl) {
      row.href = resource.url
      row.target = '_blank'
      row.rel = 'noopener noreferrer'
    }
    const number = document.createElement('b')
    number.textContent = String(index + 1).padStart(2, '0')
    const body = document.createElement('div')
    const type = document.createElement('small')
    type.textContent = resource.type
    const name = document.createElement('h3')
    name.textContent = resource.name
    const description = document.createElement('p')
    description.textContent = resource.description
    body.append(type, name, description)
    if (resource.phone) {
      const phone = document.createElement('strong')
      phone.textContent = resource.phone
      body.append(phone)
    }
    row.append(number, body)
    if (safeUrl) {
      const arrow = document.createElement('i')
      arrow.textContent = '↗'
      arrow.setAttribute('aria-hidden', 'true')
      row.append(arrow)
    }
    list.append(row)
  }
}

async function loadResources() {
  if (resourcesLoaded || resourcesLoading) return
  resourcesLoading = true
  try {
    const data = await request('/api/resources')
    renderResources(data.resources || [])
    byId('disclaimer').textContent = data.disclaimer || ''
    byId('resources-error').textContent = ''
    resourcesLoaded = true
  } catch (error) {
    byId('resources-error').textContent = error.code === 'network' ? 'Ressources indisponibles. Vérifiez votre connexion.' : error.message
  } finally {
    resourcesLoading = false
  }
}

function showTab(tab) {
  const resources = tab === 'resources'
  byId('quiz-panel').hidden = resources
  byId('resources-panel').hidden = !resources
  byId('quiz-tab').classList.toggle('active', !resources)
  byId('resources-tab').classList.toggle('active', resources)
  byId('quiz-tab').setAttribute('aria-pressed', String(!resources))
  byId('resources-tab').setAttribute('aria-pressed', String(resources))
  window.scrollTo(0, 0)
  if (resources) void loadResources()
}

byId('join-view').addEventListener('submit', (event) => void join(event))
byId('quiz-tab').addEventListener('click', () => showTab('quiz'))
byId('resources-tab').addEventListener('click', () => showTab('resources'))
byId('help-link').addEventListener('click', () => showTab('resources'))
document.addEventListener('visibilitychange', () => void refresh())

render()
void refresh()
setInterval(() => void refresh(), 500)
setInterval(renderCountdown, 200)
