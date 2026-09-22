import AsyncStorage from '@react-native-async-storage/async-storage'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

type Phase = 'waiting' | 'question' | 'reveal' | 'checkpoint' | 'finished'
type Tab = 'quiz' | 'resources' | 'admin'

interface QuizState {
  phase: Phase
  questionIndex: number
  questionCount: number
  deadline: number | null
  question: { id: number; prompt: string; options: string[]; category: string } | null
  reveal?: { answerIndex: number; explanation: string; selectedIndex: number | null }
  hasAnswered: boolean
  ownScore: number | null
  ownRank: number | null
  playersCount: number
  leaderboard?: Array<{ rank: number; name: string; score: number }>
}

interface Resource {
  id: number
  name: string
  description: string
  url: string
  phone: string | null
  type: string
}

interface AdminQuestion {
  id: number
  prompt: string
  options: string[]
  answerIndex: number
  explanation: string
  category: string
  position: number
}

const playerKey = 'womenflare-player-id'
const adminKey = 'womenflare-admin-token'
const optionLabels = ['A', 'B', 'C', 'D']
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '')

async function api<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  if (!apiUrl) throw new Error('EXPO_PUBLIC_API_URL n’est pas configurée.')
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? 'Une erreur est survenue.')
  }
  return response.json() as Promise<T>
}

function Mark() {
  return (
    <View style={styles.mark}>
      <View style={[styles.petals, styles.petalOne]} />
      <View style={[styles.petals, styles.petalTwo]} />
      <View style={[styles.petals, styles.petalThree]} />
    </View>
  )
}

function Countdown({ deadline }: { deadline: number | null }) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil(((deadline ?? Date.now()) - Date.now()) / 1000)))
    update()
    const timer = setInterval(update, 200)
    return () => clearInterval(timer)
  }, [deadline])
  return <View style={styles.countdown}><Text style={styles.countdownNumber}>{remaining}</Text><Text style={styles.countdownUnit}>SEC.</Text></View>
}

function Header({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.brand} onPress={() => onChange('quiz')}><Mark /><Text style={styles.brandName}>WomenFlare</Text></Pressable>
      <View style={styles.tabs}>
        {(['quiz', 'resources'] as const).map((item) => (
          <Pressable key={item} style={[styles.tab, tab === item && styles.tabActive]} onPress={() => onChange(item)}>
            <Text style={[styles.tabLabel, tab === item && styles.tabLabelActive]}>{item === 'quiz' ? 'Quiz' : 'Ressources'}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityLabel="Espace administrateur" onPress={() => onChange('admin')} style={[styles.gearButton, tab === 'admin' && styles.gearButtonActive]}>
          <Text style={[styles.gear, tab === 'admin' && styles.gearActive]}>⚙</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Join({ onJoined }: { onJoined: (playerId: string, state: QuizState) => void }) {
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  const join = async () => {
    if (!name.trim() || joining) return
    setJoining(true)
    setError('')
    try {
      const result = await api<{ playerId: string; state: QuizState }>('/api/session/join', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      await AsyncStorage.setItem(playerKey, result.playerId)
      onJoined(result.playerId, result.state)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de rejoindre le quiz.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.join} keyboardShouldPersistTaps="handled">
        <View style={styles.dateCard}><Text style={styles.dateNumber}>25</Text><Text style={styles.dateMonth}>NOVEMBRE</Text></View>
        <Text style={styles.eyebrow}>JOURNÉE INTERNATIONALE DU 25 NOVEMBRE</Text>
        <Text style={styles.hero}>Voir les biais.{`\n`}<Text style={styles.heroAccent}>Changer les réflexes.</Text></Text>
        <Text style={styles.lead}>20 situations du quotidien professionnel. Un temps court pour choisir, un temps collectif pour comprendre.</Text>
        <Text style={styles.label}>VOTRE NOM OU PSEUDO</Text>
        <TextInput
          autoCapitalize="words"
          autoComplete="nickname"
          maxLength={40}
          onChangeText={setName}
          onSubmitEditing={join}
          placeholder="Ex. Camille"
          placeholderTextColor="#8b818f"
          returnKeyType="go"
          style={styles.input}
          value={name}
        />
        <Pressable disabled={joining || !name.trim()} onPress={join} style={({ pressed }) => [styles.primaryButton, (joining || !name.trim()) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonLabel}>{joining ? 'Connexion…' : 'Rejoindre'}</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.quiet}>●  15 secondes par question · podium toutes les 5 questions</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Leaderboard({ state }: { state: QuizState }) {
  const top = state.leaderboard?.slice(0, state.phase === 'finished' ? 10 : 3) ?? []
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.eyebrow}>{state.phase === 'finished' ? 'CLASSEMENT FINAL' : `APRÈS ${state.questionIndex + 1} QUESTIONS`}</Text>
      <Text style={styles.title}>{state.phase === 'finished' ? 'Merci d’avoir participé.' : 'Le podium se dessine.'}</Text>
      <View style={styles.ranking}>
        {top.map((entry) => (
          <View key={`${entry.rank}-${entry.name}`} style={[styles.rank, entry.rank === 1 && styles.firstRank]}>
            <Text style={[styles.rankNumber, entry.rank === 1 && styles.firstRankNumber]}>{entry.rank}</Text>
            <Text numberOfLines={1} style={styles.rankName}>{entry.name}</Text>
            <Text style={styles.rankScore}>{entry.score} pts</Text>
          </View>
        ))}
      </View>
      {state.ownRank ? <Text style={styles.ownRank}>Votre position : <Text style={styles.strong}>#{state.ownRank}</Text> · {state.ownScore} points</Text> : null}
    </ScrollView>
  )
}

function Question({ state, playerId, onResources }: { state: QuizState; playerId: string; onResources: () => void }) {
  const [answering, setAnswering] = useState(false)
  const [answerError, setAnswerError] = useState('')
  const question = state.question
  if (!question) return null

  const answer = async (optionIndex: number) => {
    if (state.hasAnswered || answering) return
    setAnswering(true)
    setAnswerError('')
    try {
      await api('/api/session/answer', { method: 'POST', body: JSON.stringify({ playerId, optionIndex }) })
    } catch (reason) {
      setAnswerError(reason instanceof Error ? reason.message : 'Réponse non enregistrée.')
      setAnswering(false)
    }
  }

  const isReveal = state.phase === 'reveal'
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.questionMeta}><Text style={styles.category}>{question.category}</Text><Countdown deadline={state.deadline} /></View>
      <Text style={styles.eyebrow}>QUESTION {state.questionIndex + 1} {isReveal ? '· RÉPONSE' : `SUR ${state.questionCount}`}</Text>
      <Text style={styles.questionTitle}>{question.prompt}</Text>
      {!isReveal ? <View style={styles.progress}><View style={[styles.progressValue, { width: `${((state.questionIndex + 1) / state.questionCount) * 100}%` }]} /></View> : null}
      <View style={styles.answers}>
        {question.options.map((option, index) => {
          const correct = isReveal && index === state.reveal?.answerIndex
          const wrong = isReveal && index === state.reveal?.selectedIndex && !correct
          return (
            <Pressable
              disabled={isReveal || state.hasAnswered || answering}
              key={`${question.id}-${index}`}
              onPress={() => answer(index)}
              style={({ pressed }) => [styles.answer, correct && styles.correctAnswer, wrong && styles.wrongAnswer, pressed && styles.pressed]}
            >
              <Text style={styles.answerLetter}>{optionLabels[index]}</Text><Text style={styles.answerText}>{option}</Text>
            </Pressable>
          )
        })}
      </View>
      {state.hasAnswered && !isReveal ? <Text style={styles.saved}>Réponse enregistrée. La correction arrive à la fin du temps.</Text> : null}
      {answerError ? <Text style={styles.error}>{answerError}</Text> : null}
      {isReveal ? <View style={styles.explanation}><Text style={styles.explanationLabel}>À RETENIR</Text><Text style={styles.explanationText}>{state.reveal?.explanation}</Text></View> : null}
      <Pressable onPress={onResources}><Text style={styles.textLink}>Besoin d’aide maintenant ? Voir les ressources</Text></Pressable>
    </ScrollView>
  )
}

function Quiz({ onResources }: { onResources: () => void }) {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [state, setState] = useState<QuizState | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { void AsyncStorage.getItem(playerKey).then((id) => { setPlayerId(id); setRestored(true) }) }, [])
  useEffect(() => {
    if (!playerId) return
    let active = true
    const refresh = async () => {
      try {
        const next = await api<QuizState>(`/api/session/state?playerId=${encodeURIComponent(playerId)}`)
        if (active) { setState(next); setError('') }
      } catch (reason) {
        if (!active) return
        const message = reason instanceof Error ? reason.message : 'Connexion interrompue.'
        if (message.includes('introuvable')) {
          await AsyncStorage.removeItem(playerKey)
          setPlayerId(null)
          setState(null)
        } else setError(message)
      }
    }
    void refresh()
    const timer = setInterval(refresh, 500)
    return () => { active = false; clearInterval(timer) }
  }, [playerId])

  if (!restored) return <View style={styles.loading}><ActivityIndicator color="#f6821f" size="large" /></View>
  if (!playerId) return <Join onJoined={(id, next) => { setPlayerId(id); setState(next) }} />
  if (!state) return <View style={styles.loading}><Mark /><Text style={styles.muted}>Connexion à la session…</Text>{error ? <Text style={styles.error}>{error}</Text> : null}</View>
  if (state.phase === 'waiting') return <View style={styles.waiting}><Mark /><Text style={styles.eyebrow}>VOUS ÊTES DANS LA SESSION</Text><Text style={styles.title}>Bienvenue.</Text><Text style={styles.lead}>L’animation commencera bientôt. {state.playersCount} participant{state.playersCount > 1 ? 's' : ''} connecté{state.playersCount > 1 ? 's' : ''}.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}</View>
  if (state.phase === 'checkpoint' || state.phase === 'finished') return <Leaderboard state={state} />
  return <Question key={state.question?.id} onResources={onResources} playerId={playerId} state={state} />
}

function Resources() {
  const [resources, setResources] = useState<Resource[]>([])
  const [disclaimer, setDisclaimer] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    void api<{ resources: Resource[]; disclaimer: string }>('/api/resources')
      .then((data) => { setResources(data.resources); setDisclaimer(data.disclaimer) })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Ressources indisponibles.'))
  }, [])

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.eyebrow}>APRÈS L’ÉVÉNEMENT</Text>
      <Text style={styles.title}>Comprendre,{`\n`}<Text style={styles.heroAccent}>écouter, agir.</Text></Text>
      <Text style={styles.lead}>Des ressources officielles et spécialisées à garder sous la main, pour soi, une collègue ou un proche.</Text>
      <View style={styles.urgent}>
        <Pressable onPress={() => Linking.openURL('tel:112')} style={styles.urgentItem}><Text style={styles.urgentLabel}>DANGER IMMÉDIAT</Text><Text style={styles.urgentNumber}>17 ou 112</Text></Pressable>
        <Pressable onPress={() => Linking.openURL('sms:114')} style={[styles.urgentItem, styles.urgentItemLast]}><Text style={styles.urgentLabel}>SMS · SOURDS ET MALENTENDANTS</Text><Text style={styles.urgentNumber}>114</Text></Pressable>
      </View>
      <Text style={styles.sectionTitle}>Écoute et accompagnement</Text>
      {resources.map((resource, index) => (
        <Pressable key={resource.id} onPress={() => Linking.openURL(resource.url)} style={styles.resource}>
          <Text style={styles.resourceIndex}>{String(index + 1).padStart(2, '0')}</Text>
          <View style={styles.resourceBody}><Text style={styles.resourceType}>{resource.type}</Text><Text style={styles.resourceName}>{resource.name}</Text><Text style={styles.resourceDescription}>{resource.description}</Text>{resource.phone ? <Text style={styles.resourcePhone}>{resource.phone}</Text> : null}</View>
          <Text style={styles.resourceArrow}>↗</Text>
        </Pressable>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.disclaimer}>{disclaimer}</Text>
    </ScrollView>
  )
}

function Admin() {
  const [token, setToken] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState<QuizState | null>(null)
  const [questions, setQuestions] = useState<AdminQuestion[]>([])
  const [editingQuestion, setEditingQuestion] = useState<AdminQuestion | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void AsyncStorage.getItem(adminKey).then((value) => { setToken(value); setRestored(true) }) }, [])
  useEffect(() => {
    if (!token) return
    let active = true
    const refresh = async () => {
      try {
        const [nextSession, questionData] = await Promise.all([
          api<QuizState>('/api/admin/session/state', undefined, token),
          api<{ questions: AdminQuestion[] }>('/api/admin/questions', undefined, token),
        ])
        if (active) { setSession(nextSession); setQuestions(questionData.questions); setMessage('') }
      } catch (reason) {
        if (active) setMessage(reason instanceof Error ? reason.message : 'Administration indisponible.')
      }
    }
    void refresh()
    const timer = setInterval(() => {
      void api<QuizState>('/api/admin/session/state', undefined, token)
        .then((next) => { if (active) setSession(next) })
        .catch((reason) => { if (active) setMessage(reason instanceof Error ? reason.message : 'Administration indisponible.') })
    }, 1_000)
    return () => { active = false; clearInterval(timer) }
  }, [token])

  const login = async () => {
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api<{ token: string }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      await AsyncStorage.setItem(adminKey, result.token)
      setToken(result.token)
      setPassword('')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Connexion impossible.')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    await AsyncStorage.removeItem(adminKey)
    setToken(null)
    setSession(null)
    setQuestions([])
    setEditingQuestion(null)
    setMessage('')
  }

  const runAction = async (action: 'start' | 'next' | 'reset') => {
    if (!token || busy) return
    setBusy(true)
    setMessage('')
    try {
      const next = await api<QuizState>(`/api/admin/session/${action}`, { method: 'POST' }, token)
      setSession(next)
      setMessage(action === 'start' ? 'Quiz lancé.' : action === 'next' ? 'Quiz avancé.' : 'Session réinitialisée.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  const confirmReset = () => Alert.alert(
    'Réinitialiser la session ?',
    'Tous les participants et leurs scores seront supprimés.',
    [{ text: 'Annuler', style: 'cancel' }, { text: 'Réinitialiser', style: 'destructive', onPress: () => void runAction('reset') }],
  )

  const saveQuestion = async () => {
    if (!token || !editingQuestion || busy) return
    setBusy(true)
    setMessage('')
    try {
      await api(`/api/admin/questions/${editingQuestion.id}`, {
        method: 'PUT',
        body: JSON.stringify(editingQuestion),
      }, token)
      setQuestions((current) => current.map((question) => question.id === editingQuestion.id ? editingQuestion : question))
      setEditingQuestion(null)
      setMessage('Question enregistrée.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  if (!restored) return <View style={styles.loading}><ActivityIndicator color={colors.orange} size="large" /></View>
  if (!token) return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.adminLogin} keyboardShouldPersistTaps="handled">
        <View style={styles.adminGear}><Text style={styles.adminGearText}>⚙</Text></View>
        <Text style={styles.eyebrow}>ESPACE ORGANISATEUR</Text>
        <Text style={styles.title}>Administration</Text>
        <Text style={styles.adminIntro}>Cette connexion est réservée à l’équipe organisatrice. Les participants rejoignent le quiz avec leur nom depuis l’onglet Quiz.</Text>
        <Text style={styles.label}>ADRESSE E-MAIL</Text>
        <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="admin@cloudflare.com" placeholderTextColor="#8b818f" style={styles.input} value={email} />
        <Text style={styles.label}>MOT DE PASSE</Text>
        <TextInput autoCapitalize="none" onChangeText={setPassword} onSubmitEditing={login} placeholder="Mot de passe" placeholderTextColor="#8b818f" returnKeyType="go" secureTextEntry style={styles.input} value={password} />
        <Pressable disabled={busy || !email.trim() || !password} onPress={login} style={[styles.primaryButton, (busy || !email.trim() || !password) && styles.disabled]}><Text style={styles.primaryButtonLabel}>{busy ? 'Connexion…' : 'Se connecter'}</Text></Pressable>
        {message ? <Text style={styles.error}>{message}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.adminHeading}><View><Text style={styles.eyebrow}>WOMENFLARE · RÉGIE</Text><Text style={styles.adminTitle}>Piloter le quiz</Text></View><Pressable onPress={logout}><Text style={styles.logout}>Déconnexion</Text></Pressable></View>
      <View style={styles.adminStats}>
        <View style={styles.adminStat}><Text style={styles.adminStatLabel}>ÉTAT</Text><Text style={styles.adminStatValue}>{session?.phase ?? '…'}</Text></View>
        <View style={styles.adminStat}><Text style={styles.adminStatLabel}>PARTICIPANTS</Text><Text style={styles.adminStatValue}>{session?.playersCount ?? 0}</Text></View>
        <View style={styles.adminStat}><Text style={styles.adminStatLabel}>QUESTION</Text><Text style={styles.adminStatValue}>{session && session.questionIndex >= 0 ? `${session.questionIndex + 1}/${session.questionCount}` : '—'}</Text></View>
      </View>
      <Pressable disabled={busy || session?.phase !== 'waiting'} onPress={() => runAction('start')} style={[styles.primaryButton, (busy || session?.phase !== 'waiting') && styles.disabled]}><Text style={styles.primaryButtonLabel}>Lancer le quiz</Text></Pressable>
      <Pressable disabled={busy || (session?.phase !== 'reveal' && session?.phase !== 'checkpoint')} onPress={() => runAction('next')} style={[styles.primaryButton, (busy || (session?.phase !== 'reveal' && session?.phase !== 'checkpoint')) && styles.disabled]}><Text style={styles.primaryButtonLabel}>{session?.phase === 'reveal' && session.questionIndex + 1 >= session.questionCount ? 'Terminer le quiz' : 'Question suivante'}</Text></Pressable>
      <Pressable disabled={busy} onPress={confirmReset} style={[styles.resetButton, busy && styles.disabled]}><Text style={styles.resetButtonLabel}>Réinitialiser la session</Text></Pressable>
      {message ? <Text style={styles.adminMessage}>{message}</Text> : null}
      <Text style={styles.adminSectionTitle}>Questions ({questions.length})</Text>
      {editingQuestion ? (
        <View style={editorStyles.editor}>
          <Text style={styles.label}>QUESTION</Text>
          <TextInput multiline onChangeText={(prompt) => setEditingQuestion({ ...editingQuestion, prompt })} placeholder="Question" placeholderTextColor="#8b818f" style={[styles.input, editorStyles.multiline]} value={editingQuestion.prompt} />
          <Text style={styles.label}>CATÉGORIE</Text>
          <TextInput onChangeText={(category) => setEditingQuestion({ ...editingQuestion, category })} placeholder="Catégorie" placeholderTextColor="#8b818f" style={styles.input} value={editingQuestion.category} />
          <Text style={styles.label}>RÉPONSES · TOUCHEZ LA LETTRE CORRECTE</Text>
          {editingQuestion.options.map((option, index) => (
            <View key={index} style={editorStyles.optionRow}>
              <Pressable onPress={() => setEditingQuestion({ ...editingQuestion, answerIndex: index })} style={[editorStyles.optionLetter, editingQuestion.answerIndex === index && editorStyles.optionLetterSelected]}>
                <Text style={[editorStyles.optionLetterText, editingQuestion.answerIndex === index && editorStyles.optionLetterTextSelected]}>{optionLabels[index]}</Text>
              </Pressable>
              <TextInput onChangeText={(value) => setEditingQuestion({ ...editingQuestion, options: editingQuestion.options.map((current, optionIndex) => optionIndex === index ? value : current) })} placeholder={`Réponse ${optionLabels[index]}`} placeholderTextColor="#8b818f" style={[styles.input, editorStyles.optionInput]} value={option} />
            </View>
          ))}
          <Text style={styles.label}>EXPLICATION</Text>
          <TextInput multiline onChangeText={(explanation) => setEditingQuestion({ ...editingQuestion, explanation })} placeholder="Explication affichée après la réponse" placeholderTextColor="#8b818f" style={[styles.input, editorStyles.multiline]} value={editingQuestion.explanation} />
          <View style={editorStyles.actions}>
            <Pressable disabled={busy} onPress={() => setEditingQuestion(null)} style={editorStyles.cancelButton}><Text style={editorStyles.cancelButtonLabel}>Annuler</Text></Pressable>
            <Pressable disabled={busy} onPress={() => void saveQuestion()} style={[editorStyles.saveButton, busy && styles.disabled]}><Text style={styles.primaryButtonLabel}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Text></Pressable>
          </View>
        </View>
      ) : null}
      {questions.map((question) => <View key={question.id} style={styles.adminQuestion}><Text style={styles.adminQuestionNumber}>{question.position}</Text><View style={styles.flex}><Text style={styles.resourceType}>{question.category}</Text><Text style={styles.adminQuestionPrompt}>{question.prompt}</Text><Text style={styles.adminAnswer}>Réponse : {optionLabels[question.answerIndex]} · {question.options[question.answerIndex]}</Text><Pressable disabled={busy} onPress={() => setEditingQuestion({ ...question, options: [...question.options] })}><Text style={editorStyles.editLink}>Modifier</Text></Pressable></View></View>)}
    </ScrollView>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('quiz')
  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'bottom']} style={styles.app}>
        <StatusBar style="dark" />
        <Header onChange={setTab} tab={tab} />
        <View style={styles.flex}>{tab === 'quiz' ? <Quiz onResources={() => setTab('resources')} /> : tab === 'resources' ? <Resources /> : <Admin />}</View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const colors = { ink: '#24143d', muted: '#756b7c', paper: '#fffdf9', orange: '#f6821f', violet: '#633f84', lilac: '#e7dcf1', line: '#ded6d1', background: '#f7f3ee' }
const styles = StyleSheet.create({
  flex: { flex: 1 }, app: { flex: 1, backgroundColor: colors.background },
  header: { height: 72, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#ded6d180' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandName: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  mark: { width: 34, height: 34, position: 'relative' }, petals: { position: 'absolute', left: 12, top: 3, width: 10, height: 28, borderRadius: 10 }, petalOne: { backgroundColor: colors.orange }, petalTwo: { backgroundColor: '#9d68ab', transform: [{ rotate: '60deg' }] }, petalThree: { backgroundColor: '#d8516c', transform: [{ rotate: '120deg' }], opacity: 0.85 },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 3 }, tab: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 20 }, tabActive: { backgroundColor: colors.ink }, tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' }, tabLabelActive: { color: '#fff' }, gearButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, marginLeft: 2, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, gearButtonActive: { borderColor: colors.orange, backgroundColor: colors.ink }, gear: { color: colors.violet, fontSize: 21, lineHeight: 24 }, gearActive: { color: colors.orange },
  join: { paddingHorizontal: 24, paddingTop: 36, paddingBottom: 60, alignItems: 'center' }, screen: { paddingHorizontal: 20, paddingTop: 34, paddingBottom: 60 },
  dateCard: { width: 145, height: 185, borderTopLeftRadius: 72, borderTopRightRadius: 72, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 42, shadowColor: '#dc9f76', shadowOffset: { width: 11, height: 11 }, shadowOpacity: 1, shadowRadius: 0, elevation: 8 }, dateNumber: { color: '#fff', fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontSize: 76, lineHeight: 82 }, dateMonth: { color: '#fff', fontSize: 10, letterSpacing: 2.5 },
  eyebrow: { color: colors.violet, fontSize: 10, lineHeight: 15, letterSpacing: 1.4, fontWeight: '800', marginBottom: 12 }, hero: { alignSelf: 'stretch', color: colors.ink, fontSize: 42, lineHeight: 44, letterSpacing: -1.8, fontWeight: '800', textAlign: 'center', marginBottom: 20 }, heroAccent: { color: colors.orange, fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontWeight: '500' },
  title: { color: colors.ink, fontSize: 42, lineHeight: 45, letterSpacing: -1.5, fontWeight: '800', marginBottom: 20 }, questionTitle: { color: colors.ink, fontSize: 29, lineHeight: 34, letterSpacing: -0.8, fontWeight: '800', marginBottom: 24 }, lead: { color: colors.muted, fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 30 }, muted: { color: colors.muted }, strong: { fontWeight: '800' },
  label: { alignSelf: 'stretch', color: colors.ink, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }, input: { width: '100%', height: 54, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.paper, color: colors.ink, fontSize: 16, marginBottom: 10 }, primaryButton: { width: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.ink }, primaryButtonLabel: { color: '#fff', fontWeight: '800' }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.75 }, quiet: { color: colors.muted, fontSize: 11, marginTop: 15 }, error: { color: '#a32c3e', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 30 }, waiting: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 14 },
  questionMeta: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, category: { flexShrink: 1, color: colors.violet, fontSize: 11, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.lilac, marginRight: 15, overflow: 'hidden' }, countdown: { width: 60, height: 60, borderWidth: 2, borderColor: colors.orange, borderRadius: 30, alignItems: 'center', justifyContent: 'center' }, countdownNumber: { color: colors.ink, fontSize: 21, lineHeight: 22, fontWeight: '800' }, countdownUnit: { color: colors.muted, fontSize: 8 },
  progress: { height: 3, backgroundColor: colors.line, marginBottom: 26 }, progressValue: { height: 3, backgroundColor: colors.orange }, answers: { gap: 11 }, answer: { minHeight: 84, padding: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.paper, flexDirection: 'row', alignItems: 'center', gap: 14 }, answerLetter: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.lilac, color: colors.violet, textAlign: 'center', lineHeight: 34, fontWeight: '800', overflow: 'hidden' }, answerText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20 }, correctAnswer: { borderWidth: 2, borderColor: '#4f8b69', backgroundColor: '#edf7f0' }, wrongAnswer: { borderColor: '#b34c5d', backgroundColor: '#faeef0' }, saved: { color: colors.violet, textAlign: 'center', fontSize: 12, marginTop: 18 }, explanation: { borderLeftWidth: 3, borderLeftColor: colors.orange, padding: 16, backgroundColor: '#fff8ef', marginTop: 22 }, explanationLabel: { color: colors.orange, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, explanationText: { color: colors.ink, fontSize: 14, lineHeight: 21, marginTop: 8 }, textLink: { color: colors.muted, fontSize: 12, textAlign: 'center', textDecorationLine: 'underline', marginTop: 26 },
  ranking: { gap: 9, marginTop: 15 }, rank: { minHeight: 62, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: colors.paper }, firstRank: { borderColor: colors.orange }, rankNumber: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#eee8e4', color: colors.ink, textAlign: 'center', lineHeight: 34, fontWeight: '800', overflow: 'hidden' }, firstRankNumber: { color: '#fff', backgroundColor: colors.orange }, rankName: { flex: 1, color: colors.ink, fontWeight: '700' }, rankScore: { color: colors.violet, fontSize: 12, fontWeight: '800' }, ownRank: { color: colors.ink, textAlign: 'center', marginTop: 28 },
  urgent: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.ink, marginVertical: 36 }, urgentItem: { padding: 22, borderBottomWidth: 1, borderBottomColor: '#ffffff22' }, urgentItemLast: { borderBottomWidth: 0 }, urgentLabel: { color: '#d4c9db', fontSize: 9, letterSpacing: 1, marginBottom: 5 }, urgentNumber: { color: '#ff9b50', fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontSize: 28 }, sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: '800', marginBottom: 10 }, resource: { flexDirection: 'row', gap: 12, paddingVertical: 20, borderTopWidth: 1, borderTopColor: colors.line }, resourceIndex: { width: 28, color: colors.orange, fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontSize: 18 }, resourceBody: { flex: 1 }, resourceType: { color: colors.violet, textTransform: 'uppercase', fontSize: 8, letterSpacing: 1.2 }, resourceName: { color: colors.ink, fontSize: 19, fontWeight: '800', marginVertical: 5 }, resourceDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 }, resourcePhone: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 9 }, resourceArrow: { color: colors.orange, fontSize: 20 }, disclaimer: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 28 },
  adminLogin: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 50 }, adminGear: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.ink, marginBottom: 28 }, adminGearText: { color: colors.orange, fontSize: 39 }, adminIntro: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: -6, marginBottom: 28 }, adminHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }, adminTitle: { color: colors.ink, fontSize: 34, lineHeight: 38, letterSpacing: -1, fontWeight: '800' }, logout: { color: colors.violet, fontSize: 11, textDecorationLine: 'underline', paddingTop: 4 }, adminStats: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.paper, marginBottom: 12, overflow: 'hidden' }, adminStat: { flex: 1, minHeight: 72, justifyContent: 'center', padding: 10, borderRightWidth: 1, borderRightColor: colors.line }, adminStatLabel: { color: colors.muted, fontSize: 7, letterSpacing: 0.7, marginBottom: 7 }, adminStatValue: { color: colors.ink, fontSize: 15, fontWeight: '800' }, resetButton: { width: '100%', minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#e8e1dd', marginTop: 9 }, resetButtonLabel: { color: '#9d3043', fontWeight: '800' }, adminMessage: { color: colors.violet, fontSize: 12, textAlign: 'center', marginTop: 14 }, adminSectionTitle: { color: colors.ink, fontSize: 22, fontWeight: '800', marginTop: 40, marginBottom: 12 }, adminQuestion: { flexDirection: 'row', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.line }, adminQuestionNumber: { width: 28, color: colors.orange, fontSize: 18, fontWeight: '800' }, adminQuestionPrompt: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', marginTop: 4 }, adminAnswer: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 7 },
})

const editorStyles = StyleSheet.create({
  editor: { padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.paper, marginBottom: 20 },
  multiline: { height: 96, paddingTop: 15, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionLetter: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.lilac },
  optionLetterSelected: { backgroundColor: colors.violet },
  optionLetterText: { color: colors.violet, fontWeight: '800' },
  optionLetterTextSelected: { color: '#fff' },
  optionInput: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#e8e1dd' },
  cancelButtonLabel: { color: colors.ink, fontWeight: '800' },
  saveButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.ink },
  editLink: { alignSelf: 'flex-start', color: colors.violet, fontSize: 12, fontWeight: '800', textDecorationLine: 'underline', marginTop: 10 },
})
