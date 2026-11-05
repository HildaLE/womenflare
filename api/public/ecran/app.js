const labels = ['A', 'B', 'C']
let board = null
let offline = false

const byId = (id) => document.getElementById(id)

function renderTimer() {
  const node = byId('stage-timer')
  if (!board || board.phase !== 'question' || !board.deadline) {
    node.textContent = '—'
    return
  }
  node.textContent = String(Math.max(0, Math.ceil((board.deadline - Date.now()) / 1000)))
}

function renderQuestion() {
  byId('stage-prompt').textContent = board.question?.prompt || ''
  const list = byId('stage-options')
  const counts = board.optionCounts
  const highest = counts ? Math.max(1, ...counts) : 0
  list.replaceChildren()
  for (const [index, option] of (board.question?.options || []).entries()) {
    const row = document.createElement('div')
    row.className = counts && index === board.answerIndex ? 'stage-option correct' : 'stage-option'
    const fill = document.createElement('i')
    if (counts) fill.style.width = `${Math.round((counts[index] / highest) * 100)}%`
    const letter = document.createElement('b')
    letter.textContent = labels[index]
    const text = document.createElement('span')
    text.textContent = option
    row.append(fill, letter, text)
    if (counts) {
      const tally = document.createElement('em')
      tally.textContent = counts[index] > 1 ? `${counts[index]} réponses` : `${counts[index]} réponse`
      row.append(tally)
    }
    list.append(row)
  }
  const explanation = byId('stage-explanation')
  explanation.textContent = board.explanation || ''
  explanation.hidden = !board.explanation
}

function renderBoard() {
  const finished = board.phase === 'finished'
  const answered = board.questionIndex + 1
  byId('stage-board-eyebrow').textContent = finished
    ? 'Classement final'
    : answered > 1 ? `Palmarès après ${answered} questions` : 'Palmarès après 1 question'
  byId('stage-board-title').textContent = finished ? 'Merci d’avoir participé.' : 'Le podium se dessine.'
  const list = byId('stage-ranking')
  list.replaceChildren()
  for (const entry of board.leaderboard || []) {
    const item = document.createElement('li')
    const rank = document.createElement('b')
    rank.textContent = `#${entry.rank}`
    const name = document.createElement('span')
    name.textContent = entry.name
    const score = document.createElement('em')
    score.textContent = `${entry.score} pts`
    item.append(rank, name, score)
    list.append(item)
  }
  if (!list.childElementCount) {
    const item = document.createElement('li')
    const name = document.createElement('span')
    name.textContent = 'Aucune réponse enregistrée pour l’instant.'
    item.append(document.createElement('b'), name)
    list.append(item)
  }
}

function render() {
  if (!board) return
  const showQuestion = board.phase === 'question' || board.phase === 'reveal'
  const showBoard = board.phase === 'checkpoint' || board.phase === 'finished'
  const people = board.playersCount
  const footer = byId('stage-footer')
  byId('stage-category').textContent = board.question?.category || 'WomenFlare'
  byId('stage-step').textContent = board.questionIndex >= 0
    ? `Question ${board.questionIndex + 1} sur ${board.questionCount}`
    : 'Session non démarrée'
  byId('stage-progress-bar').style.width = board.questionIndex >= 0
    ? `${Math.round(((board.questionIndex + 1) / board.questionCount) * 100)}%`
    : '0%'
  footer.classList.toggle('stage-offline', offline)
  footer.textContent = offline
    ? 'Connexion perdue, nouvelle tentative…'
    : board.phase === 'question'
      ? `${board.answeredCount} / ${people} réponses reçues`
      : people > 1 ? `${people} participants connectés` : `${people} participant connecté`
  byId('stage-idle').hidden = board.phase !== 'waiting'
  byId('stage-question').hidden = !showQuestion
  byId('stage-board').hidden = !showBoard
  byId('stage-timer').hidden = board.phase !== 'question'
  if (showQuestion) renderQuestion()
  if (showBoard) renderBoard()
  renderTimer()
}

async function refresh() {
  try {
    const response = await fetch('/api/session/board')
    if (!response.ok) throw new Error(String(response.status))
    board = await response.json()
    offline = false
  } catch {
    offline = true
    if (!board) {
      byId('stage-step').textContent = 'Hors ligne'
      byId('stage-footer').classList.add('stage-offline')
      byId('stage-footer').textContent = 'Impossible de joindre la session, nouvelle tentative…'
      return
    }
  }
  render()
}

byId('fullscreen-stage').addEventListener('click', () => {
  if (document.fullscreenElement) {
    void document.exitFullscreen()
    return
  }
  const started = document.documentElement.requestFullscreen
    ? document.documentElement.requestFullscreen()
    : null
  if (started) started.catch(() => {})
})

document.addEventListener('fullscreenchange', () => {
  byId('fullscreen-stage').textContent = document.fullscreenElement ? 'Quitter' : 'Plein écran'
})

void refresh()
setInterval(() => void refresh(), 1000)
setInterval(renderTimer, 200)
