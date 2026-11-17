/* Projection helpers shared by the admin console (Projection tab) and the public /ecran/ page. */

window.WomenFlareStage = (() => {
  // Static, trusted SVG markup only: participant names are always inserted with textContent.
  const avatars = {
    1: `<svg viewBox="0 0 120 120" aria-hidden="true">
      <polygon points="30,38 40,12 52,30 60,6 68,30 80,12 90,38" fill="#ffd23f" stroke="#e0a800" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="40" cy="13" r="4" fill="#d8516c"/><circle cx="60" cy="7" r="4.5" fill="#7fcf9e"/><circle cx="80" cy="13" r="4" fill="#d8516c"/>
      <circle cx="60" cy="72" r="40" fill="#f6821f"/>
      <ellipse cx="45" cy="66" rx="6" ry="8" fill="#24143d"/><ellipse cx="75" cy="66" rx="6" ry="8" fill="#24143d"/>
      <circle cx="47" cy="63" r="2.4" fill="#fff"/><circle cx="77" cy="63" r="2.4" fill="#fff"/>
      <circle cx="34" cy="82" r="7" fill="#ff5d8f" opacity=".55"/><circle cx="86" cy="82" r="7" fill="#ff5d8f" opacity=".55"/>
      <path d="M42 84 Q60 104 78 84 Z" fill="#24143d"/><path d="M50 93 Q60 100 70 93 Q60 90 50 93 Z" fill="#ff7a9c"/>
    </svg>`,
    2: `<svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="68" r="42" fill="#9d68ab"/>
      <path d="M26 44 Q60 18 94 44" fill="none" stroke="#7a4b88" stroke-width="8" stroke-linecap="round"/>
      <rect x="28" y="54" width="27" height="20" rx="9" fill="#24143d"/><rect x="65" y="54" width="27" height="20" rx="9" fill="#24143d"/>
      <path d="M55 61 H65" stroke="#24143d" stroke-width="5"/>
      <path d="M33 59 l8 0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/><path d="M70 59 l8 0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      <path d="M40 86 Q60 102 80 86" fill="none" stroke="#24143d" stroke-width="6" stroke-linecap="round"/>
      <circle cx="34" cy="84" r="6" fill="#ff5d8f" opacity=".45"/><circle cx="86" cy="84" r="6" fill="#ff5d8f" opacity=".45"/>
      <path d="M98 26 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 Z" fill="#ffd23f"/>
    </svg>`,
    3: `<svg viewBox="0 0 120 120" aria-hidden="true">
      <polygon points="60,2 78,40 42,40" fill="#7fcf9e" stroke="#4f8b69" stroke-width="3" stroke-linejoin="round"/>
      <path d="M50 22 L70 22 M46 31 L74 31" stroke="#fffdf9" stroke-width="4" stroke-linecap="round"/>
      <circle cx="60" cy="4" r="6" fill="#d8516c"/>
      <circle cx="60" cy="74" r="38" fill="#dc9f76"/>
      <path d="M38 68 Q45 62 52 68" fill="none" stroke="#24143d" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="76" cy="68" rx="6" ry="7.5" fill="#24143d"/><circle cx="78" cy="65" r="2.3" fill="#fff"/>
      <circle cx="36" cy="84" r="6.5" fill="#ff5d8f" opacity=".5"/><circle cx="84" cy="84" r="6.5" fill="#ff5d8f" opacity=".5"/>
      <path d="M44 86 Q60 98 76 86" fill="none" stroke="#24143d" stroke-width="5" stroke-linecap="round"/>
      <path d="M58 91 Q64 106 70 90 Z" fill="#ff7a9c" stroke="#24143d" stroke-width="2.5" stroke-linejoin="round"/>
    </svg>`,
  }
  const confettiColors = ['#f6821f', '#ffd23f', '#9d68ab', '#d8516c', '#7fcf9e', '#e7dcf1']

  function place(rank, entry) {
    const column = document.createElement('div')
    column.className = `podium-place place-${rank}`
    const winner = document.createElement('div')
    winner.className = entry ? 'podium-winner' : 'podium-winner empty'
    if (entry) {
      const avatar = document.createElement('div')
      avatar.className = 'podium-avatar'
      avatar.innerHTML = avatars[rank]
      const name = document.createElement('strong')
      name.textContent = entry.name
      const score = document.createElement('em')
      score.textContent = `${entry.score} pts`
      winner.append(avatar, name, score)
    }
    const step = document.createElement('div')
    step.className = 'podium-step'
    const number = document.createElement('b')
    number.textContent = String(rank)
    step.append(number)
    column.append(winner, step)
    return column
  }

  function confetti() {
    const layer = document.createElement('div')
    layer.className = 'podium-confetti'
    layer.setAttribute('aria-hidden', 'true')
    for (let index = 0; index < 70; index++) {
      const piece = document.createElement('i')
      piece.style.left = `${Math.random() * 100}%`
      piece.style.background = confettiColors[index % confettiColors.length]
      piece.style.animationDuration = `${2.6 + Math.random() * 2.4}s`
      piece.style.animationDelay = `${12 + Math.random() * 2.5}s`
      layer.append(piece)
    }
    return layer
  }

  // Builds the final podium once: rebuilding on every poll would restart the curtain and reveal animations.
  function renderPodium(container, leaderboard) {
    const top = (leaderboard || []).slice(0, 3)
    const key = JSON.stringify(top)
    if (container.dataset.key === key) return
    container.dataset.key = key
    const byRank = (rank) => top.find((entry) => entry.rank === rank)
    const podium = document.createElement('div')
    podium.className = 'podium'
    podium.append(place(2, byRank(2)), place(1, byRank(1)), place(3, byRank(3)))
    const left = document.createElement('div')
    left.className = 'curtain curtain-left'
    const right = document.createElement('div')
    right.className = 'curtain curtain-right'
    const valance = document.createElement('div')
    valance.className = 'curtain-valance'
    container.replaceChildren(podium, confetti(), left, right, valance)
  }

  function resetPodium(container) {
    if (!container.dataset.key) return
    delete container.dataset.key
    container.replaceChildren()
  }

  function tickCountdown(node, deadline) {
    const remaining = Math.max(0, Math.ceil(((deadline ?? Date.now()) - Date.now()) / 1000))
    const text = remaining > 0 ? String(remaining) : 'Go !'
    if (node.textContent === text) return
    node.textContent = text
    node.classList.remove('pop')
    void node.offsetWidth
    node.classList.add('pop')
  }

  function setExplanation(wrapper, textNode, text) {
    textNode.textContent = text || ''
    wrapper.hidden = !text
  }

  return { renderPodium, resetPodium, tickCountdown, setExplanation }
})()
