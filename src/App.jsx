import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase.js'

// ─── CONSTANTS ───────────────────────────────────────────────────
const LETTERS = ['A','B','C','D']

// ─── CLAUDE API (via Supabase Edge Function proxy) ───────────────
async function generateQuestions(b64, isPdf, count, topic) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(
    'https://emycrfyusnbxbpldorkp.supabase.co/functions/v1/generate-questions',
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ b64, isPdf, count, topic }),
    }
  )
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'Edge function error')
  return data.questions
}

// ─── FILE UTILS ──────────────────────────────────────────────────
function readAsBase64(file) {
  return new Promise((res,rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}
function initials(name) {
  return (name||'?').trim().split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,2)
}
function b64ToBlobUrl(b64) {
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }))
}

// ════════════════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [session,   setSession]   = useState(undefined) // undefined=loading
  const [profile,   setProfile]   = useState(null)
  const [view,      setView]      = useState('dashboard')
  const [notif,     setNotif]     = useState(null)
  const [viewingPdf,setViewingPdf]= useState(null)

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => setSession(session))
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  // Load profile once logged in
  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data))
  }, [session])

  const notify = useCallback((msg, type='ok') => {
    setNotif({ msg, type })
    setTimeout(() => setNotif(null), 3500)
  }, [])

  if (session === undefined) return <Loader text="Loading…" />
  if (!session) return <AuthScreen notify={notify} />

  if (viewingPdf) return <PdfViewer b64={viewingPdf} onClose={() => setViewingPdf(null)} />

  return (
    <div style={{ minHeight:'100vh' }}>
      {notif && <Notif msg={notif.msg} type={notif.type} />}
      <TopNav profile={profile} view={view} setView={setView}
        onSignOut={async () => { await supabase.auth.signOut(); setView('dashboard') }} />

      <div style={{ maxWidth:820, margin:'0 auto', padding:'2rem 1.5rem' }}>
        {view === 'dashboard'  && <Dashboard profile={profile} setView={setView} setViewingPdf={setViewingPdf} notify={notify} />}
        {view === 'quiz'       && <QuizView profile={profile} notify={notify} setView={setView} />}
        {view === 'leaderboard'&& <Leaderboard />}
        {view === 'admin'      && profile?.is_admin && <AdminPanel notify={notify} />}
        {view === 'profile'    && <ProfileView profile={profile} setProfile={setProfile} notify={notify} />}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// AUTH SCREEN  (sign up + sign in)
// ════════════════════════════════════════════════════════════════
function AuthScreen({ notify }) {
  const [mode,     setMode]     = useState('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [loading,  setLoading]  = useState(false)
  const [err,      setErr]      = useState('')

  const submit = async () => {
    setErr(''); setLoading(true)
    try {
      if (mode === 'signup') {
        if (!name.trim()) { setErr('Please enter your full name'); setLoading(false); return }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name.trim() } }
        })
        if (error) throw error
        notify('Account created! Check your email to confirm.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e) { setErr(e.message) }
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem' }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:'2rem', justifyContent:'center' }}>
          <div style={S.gem} />
          <h1 style={{ fontSize:'1.5rem', fontWeight:800, letterSpacing:'-0.02em' }}>Rock Knowledge Quiz</h1>
        </div>

        <div style={S.card}>
          <div style={{ display:'flex', gap:6, marginBottom:'1.5rem' }}>
            {['signin','signup'].map(m => (
              <button key={m} style={{ ...S.tab, ...(mode===m ? S.tabActive : {}) }}
                onClick={() => { setMode(m); setErr('') }}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {mode === 'signup' && (
            <Field label="Full name" value={name} onChange={setName}
              placeholder="e.g. Thabo Mokoena" />
          )}
          <Field label="Email" type="email" value={email} onChange={setEmail}
            placeholder="you@company.com" />
          <Field label="Password" type="password" value={password} onChange={setPassword}
            placeholder="Min 6 characters" onEnter={submit} />

          {err && <p style={{ color:'var(--fault)', fontSize:'0.82rem', marginBottom:'1rem' }}>{err}</p>}

          <Btn primary onClick={submit} disabled={loading} style={{ width:'100%' }}>
            {loading ? <><Spin /> {mode==='signin'?'Signing in…':'Creating account…'}</>
                     : mode==='signin' ? 'Sign in' : 'Create account'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// TOP NAV
// ════════════════════════════════════════════════════════════════
function TopNav({ profile, view, setView, onSignOut }) {
  const isAdmin = profile?.is_admin
  const navItems = [
    { id:'dashboard',   label:'Home' },
    { id:'quiz',        label:'Take quiz' },
    { id:'leaderboard', label:'Leaderboard' },
    ...(isAdmin ? [{ id:'admin', label:'Admin' }] : []),
  ]
  return (
    <nav style={{ background:'var(--stone)', borderBottom:'1px solid var(--slate)', padding:'0 1.5rem', display:'flex', alignItems:'center', justifyContent:'space-between', height:56, gap:'1rem', flexWrap:'wrap' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ ...S.gem, width:28, height:28 }} />
        <span style={{ fontWeight:800, fontSize:'0.95rem', letterSpacing:'-0.02em' }}>Rock Quiz</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:4, flexWrap:'wrap' }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ background:'none', border:'none', color: view===n.id ? 'var(--ore)' : 'var(--dust)',
              fontFamily:'Syne,sans-serif', fontWeight:600, fontSize:'0.85rem', cursor:'pointer',
              padding:'6px 12px', borderRadius:8,
              background: view===n.id ? 'rgba(232,160,32,0.12)' : 'transparent' }}>
            {n.label}
          </button>
        ))}
        <div style={{ width:1, height:20, background:'var(--slate)', margin:'0 4px' }} />
        <button onClick={() => setView('profile')}
          style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', padding:'4px 8px', borderRadius:8 }}>
          <Avatar name={profile?.full_name || '?'} size={28} />
          <span style={{ fontSize:'0.82rem', color:'var(--dust)', fontFamily:'Syne,sans-serif' }}>
            {profile?.full_name?.split(' ')[0] || 'Me'}
          </span>
        </button>
        <Btn ghost sm onClick={onSignOut}>Sign out</Btn>
      </div>
    </nav>
  )
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════
function Dashboard({ profile, setView, setViewingPdf, notify }) {
  const [weeks,       setWeeks]       = useState([])
  const [submissions, setSubmissions] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('quiz_weeks').select('id,week_number,title,topic_hint,questions,is_active,deadline,pdf_path,created_at').eq('is_active',true).order('week_number', { ascending:false }),
      supabase.from('quiz_submissions').select('week_id').eq('user_id', profile?.id || '')
    ]).then(([{ data:w }, { data:s }]) => {
      setWeeks(w || [])
      setSubmissions((s||[]).map(x => x.week_id))
      setLoading(false)
    })
  }, [profile])

  const currentWeek = weeks[0] || null
  const done = submissions.includes(currentWeek?.id)

  if (loading) return <Loader text="Loading dashboard…" inline />

  return (
    <>
      {/* Welcome */}
      <div style={{ marginBottom:'2rem' }}>
        <h2 style={{ fontSize:'1.5rem', fontWeight:800, letterSpacing:'-0.02em', marginBottom:4 }}>
          Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}
        </h2>
        <p style={{ color:'var(--dust)', fontSize:'0.88rem' }}>
          {weeks.length} week{weeks.length!==1?'s':''} available · {submissions.length} completed
        </p>
      </div>

      {/* Current week */}
      {currentWeek ? (
        <>
          <SLabel>This week</SLabel>
          <div style={{ ...S.card, borderColor: done ? 'var(--safe)' : 'var(--ore)', marginBottom:'2rem' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
              <div>
                <span style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--ore)', fontFamily:'monospace', letterSpacing:'0.1em', textTransform:'uppercase' }}>Week {currentWeek.week_number}</span>
                <h3 style={{ fontSize:'1.1rem', fontWeight:700, margin:'4px 0' }}>{currentWeek.title}</h3>
                {currentWeek.topic_hint && <p style={{ color:'var(--dust)', fontSize:'0.85rem' }}>{currentWeek.topic_hint}</p>}
                <p style={{ color:'var(--seam)', fontSize:'0.75rem', fontFamily:'monospace', marginTop:4 }}>
                  {currentWeek.questions?.length || 0} questions
                  {currentWeek.deadline ? ` · Due ${new Date(currentWeek.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}` : ''}
                </p>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                {currentWeek.pdf_path && (
                  <Btn ghost sm onClick={() => setViewingPdf(currentWeek.pdf_path)}>
                    <EyeIcon /> Read report
                  </Btn>
                )}
                {done
                  ? <span style={{ fontSize:'0.82rem', color:'var(--safe)', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>✓ Submitted</span>
                  : <Btn primary onClick={() => setView('quiz')}>Start quiz →</Btn>
                }
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign:'center', padding:'4rem 2rem', border:'1px dashed var(--slate)', borderRadius:16 }}>
          <div style={{ ...S.gem, width:48, height:48, margin:'0 auto 1rem' }} />
          <p style={{ color:'var(--dust)' }}>No quiz available yet — check back soon.</p>
        </div>
      )}

      {/* Previous weeks */}
      {weeks.length > 1 && (
        <>
          <SLabel>Previous weeks</SLabel>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
            {weeks.slice(1).map(w => {
              const isDone = submissions.includes(w.id)
              return (
                <div key={w.id} style={{ ...S.card, display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' }}>
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:'0.7rem', color:'var(--ore)', fontFamily:'monospace', fontWeight:700 }}>Week {w.week_number}</span>
                    <p style={{ fontWeight:600, color:'var(--chalk)', margin:'2px 0' }}>{w.title}</p>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    {w.pdf_path && <Btn ghost sm onClick={() => setViewingPdf(w.pdf_path)}><EyeIcon /> Read</Btn>}
                    {isDone
                      ? <span style={{ fontSize:'0.82rem', color:'var(--safe)', fontWeight:700 }}>✓ Done</span>
                      : <Btn primary sm onClick={() => setView('quiz')}>Take quiz</Btn>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// QUIZ VIEW
// ════════════════════════════════════════════════════════════════
function QuizView({ profile, notify, setView }) {
  const [week,       setWeek]       = useState(null)
  const [qIndex,     setQIndex]     = useState(0)
  const [revealed,   setRevealed]   = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [answers,    setAnswers]    = useState([])
  const [phase,      setPhase]      = useState('loading') // loading|already-done|question|done
  const [timeLeft,   setTimeLeft]   = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    (async () => {
      const { data:w } = await supabase.from('quiz_weeks')
        .select('*').eq('is_active',true).order('week_number',{ ascending:false }).limit(1).single()
      if (!w) { setPhase('no-week'); return }
      setWeek(w)
      // Check if already submitted
      const { data:sub } = await supabase.from('quiz_submissions')
        .select('id').eq('user_id', profile.id).eq('week_id', w.id).maybeSingle()
      setPhase(sub ? 'already-done' : 'question')
    })()
  }, [profile])

  // Timer per question (30s)
  useEffect(() => {
    if (phase !== 'question' || revealed) return
    setTimeLeft(30)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); setRevealed(true); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase, qIndex, revealed])

  const selectAnswer = (idx) => {
    if (revealed) return
    clearInterval(timerRef.current)
    setSelected(idx)
    setRevealed(true)
  }

  const next = async () => {
    const q = week.questions[qIndex]
    const newAnswers = [...answers, { qIdx:qIndex, chosen:selected, correct: selected===q.correct }]
    if (qIndex + 1 >= week.questions.length) {
      // Save to Supabase
      const score = newAnswers.filter(a=>a.correct).length
      const { error } = await supabase.from('quiz_submissions').upsert({
        user_id: profile.id, week_id: week.id,
        answers: newAnswers, score, total: week.questions.length
      }, { onConflict:'user_id,week_id' })
      if (error) notify('Could not save score: ' + error.message, 'err')
      else notify(`Submitted! ${score}/${week.questions.length} correct`)
      setAnswers(newAnswers)
      setPhase('done')
    } else {
      setAnswers(newAnswers)
      setQIndex(i => i+1)
      setRevealed(false)
      setSelected(null)
    }
  }

  if (phase === 'loading') return <Loader text="Loading quiz…" inline />
  if (phase === 'no-week')     return <EmptyState text="No quiz available yet." onBack={() => setView('dashboard')} />
  if (phase === 'already-done') return <AlreadyDone onLeaderboard={() => setView('leaderboard')} onDashboard={() => setView('dashboard')} />

  if (phase === 'done') {
    const score = answers.filter(a=>a.correct).length
    return <ResultsView answers={answers} questions={week.questions} score={score}
      onDashboard={() => setView('dashboard')} onLeaderboard={() => setView('leaderboard')} />
  }

  const q = week.questions[qIndex]
  const urgent = timeLeft !== null && timeLeft <= 5

  return (
    <>
      {/* Progress bar */}
      <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'2rem' }}>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:'0.72rem', color:'var(--dust)', fontFamily:'monospace', marginBottom:6 }}>
            Week {week.week_number} · Q{qIndex+1} of {week.questions.length}
          </p>
          <div style={{ height:4, background:'var(--slate)', borderRadius:2 }}>
            <div style={{ height:'100%', background:'var(--ore)', borderRadius:2, width:`${((qIndex+1)/week.questions.length)*100}%`, transition:'width 0.4s' }} />
          </div>
        </div>
        {timeLeft !== null && (
          <span style={{ fontSize:'1.75rem', fontWeight:800, fontFamily:'monospace', color: urgent?'var(--fault)':'var(--chalk)', minWidth:'2.5ch', animation: urgent?'pulse 0.5s ease-in-out infinite alternate':'none' }}>
            {timeLeft}
          </span>
        )}
      </div>

      {/* Question */}
      <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--ore)', fontFamily:'monospace', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:'0.875rem' }}>
        {q.category || 'Rock engineering'}
      </p>
      <h2 style={{ fontSize:'clamp(1.1rem,2.5vw,1.5rem)', fontWeight:700, lineHeight:1.4, marginBottom:'2rem', letterSpacing:'-0.01em' }}>
        {q.question}
      </h2>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'1.5rem' }}>
        {q.options.map((opt,i) => {
          let extra = {}
          if (revealed) {
            if (i===q.correct) extra = { background:'rgba(58,184,122,0.12)', borderColor:'var(--safe)' }
            else if (i===selected) extra = { background:'rgba(224,80,80,0.08)', borderColor:'var(--fault)' }
            else extra = { opacity:0.4 }
          }
          const lExtra = revealed && i===q.correct ? { background:'var(--safe)', color:'var(--rock)' }
            : revealed && i===selected && i!==q.correct ? { background:'var(--fault)', color:'#fff' } : {}
          return (
            <button key={i} onClick={() => selectAnswer(i)} disabled={revealed}
              style={{ background:'var(--stone)', border:'1.5px solid var(--slate)', borderRadius:12,
                padding:'1rem 1.125rem', textAlign:'left', cursor:revealed?'default':'pointer',
                display:'flex', alignItems:'flex-start', gap:10, ...extra }}>
              <span style={{ width:28, height:28, borderRadius:8, background:'var(--slate)', display:'flex',
                alignItems:'center', justifyContent:'center', fontSize:'0.72rem', fontWeight:800,
                color:'var(--dust)', fontFamily:'monospace', flexShrink:0, ...lExtra }}>
                {LETTERS[i]}
              </span>
              <span style={{ fontSize:'0.9rem', fontWeight:500, color:'var(--chalk)', lineHeight:1.4, paddingTop:3 }}>
                {opt}
              </span>
            </button>
          )
        })}
      </div>

      {revealed && q.explanation && (
        <div style={{ background:'var(--stone)', border:'1px solid var(--slate)', borderLeft:'3px solid var(--ore)',
          borderRadius:'0 8px 8px 0', padding:'0.875rem 1.125rem', fontSize:'0.85rem', color:'var(--dust)',
          lineHeight:1.6, marginBottom:'1.5rem' }}>
          <strong style={{ color:'var(--chalk)' }}>Why {LETTERS[q.correct]} is correct: </strong>
          {q.explanation}
        </div>
      )}

      {revealed && (
        <div style={{ display:'flex', justifyContent:'center' }}>
          <Btn primary onClick={next}>
            {qIndex+1 >= week.questions.length ? 'Submit answers →' : 'Next question →'}
          </Btn>
        </div>
      )}
    </>
  )
}

function AlreadyDone({ onLeaderboard, onDashboard }) {
  return (
    <div style={{ textAlign:'center', padding:'4rem 2rem' }}>
      <div style={{ ...S.gem, width:52, height:52, margin:'0 auto 1.25rem' }} />
      <h2 style={{ fontSize:'1.5rem', fontWeight:800, marginBottom:'0.5rem' }}>Already submitted!</h2>
      <p style={{ color:'var(--dust)', marginBottom:'2rem' }}>You've already completed this week's quiz.</p>
      <div style={{ display:'flex', gap:'1rem', justifyContent:'center' }}>
        <Btn ghost onClick={onDashboard}>Dashboard</Btn>
        <Btn primary onClick={onLeaderboard}>See leaderboard</Btn>
      </div>
    </div>
  )
}

function ResultsView({ answers, questions, score, onDashboard, onLeaderboard }) {
  const pct = Math.round(score/questions.length*100)
  const msg = pct===100?'Perfect score!':pct>=70?'Well done!':pct>=50?'Good effort!':'Keep practising!'
  return (
    <div style={{ maxWidth:600, margin:'0 auto' }}>
      <div style={{ ...S.gem, width:52, height:52, margin:'0 auto 1.25rem' }} />
      <h2 style={{ fontSize:'2rem', fontWeight:800, textAlign:'center', marginBottom:'0.5rem' }}>{msg}</h2>
      <div style={{ width:120, height:120, borderRadius:'50%', border:'2.5px solid var(--ore)',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', margin:'0 auto 2rem' }}>
        <span style={{ fontSize:'2.25rem', fontWeight:800, color:'var(--ore)', lineHeight:1 }}>{score}</span>
        <span style={{ fontSize:'0.78rem', color:'var(--dust)', fontFamily:'monospace' }}>of {questions.length}</span>
      </div>
      <div style={{ marginBottom:'2rem' }}>
        {questions.map((q,i) => {
          const a = answers[i]
          return (
            <div key={i} style={{ display:'flex', gap:10, padding:'10px 14px', background:'var(--stone)',
              border:'1px solid var(--slate)', borderRadius:8, marginBottom:6, alignItems:'flex-start' }}>
              <span style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--ore)', fontFamily:'monospace', minWidth:24, paddingTop:2 }}>Q{i+1}</span>
              <span style={{ flex:1, fontSize:'0.85rem', color:'var(--chalk)', lineHeight:1.35 }}>{q.question}</span>
              <span style={{ color: a?.correct?'var(--safe)':'var(--fault)', fontSize:'1rem' }}>{a?.correct?'✓':'✗'}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display:'flex', gap:'1rem', justifyContent:'center' }}>
        <Btn ghost onClick={onDashboard}>Dashboard</Btn>
        <Btn primary onClick={onLeaderboard}>Leaderboard →</Btn>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// LEADERBOARD
// ════════════════════════════════════════════════════════════════
function Leaderboard() {
  const [tab,  setTab]  = useState('week')
  const [data, setData] = useState([])
  const [week, setWeek] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data:w } = await supabase.from('quiz_weeks')
        .select('id,week_number,title').eq('is_active',true)
        .order('week_number',{ ascending:false }).limit(1).single()
      setWeek(w)

      const { data:subs } = await supabase.from('quiz_submissions')
        .select('user_id,week_id,score,total,submitted_at,profiles(full_name)')
        .order('submitted_at',{ ascending:false })
      setData(subs || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <Loader text="Loading leaderboard…" inline />

  const weekSubs = week ? data.filter(s => s.week_id===week.id)
    .sort((a,b) => b.score-a.score || new Date(a.submitted_at)-new Date(b.submitted_at)) : []

  // All-time: sum scores per user
  const allTime = Object.values(
    data.reduce((acc,s) => {
      const name = s.profiles?.full_name || 'Unknown'
      if (!acc[s.user_id]) acc[s.user_id] = { name, totalPts:0, weeks:0, perfects:0 }
      acc[s.user_id].totalPts += s.score
      acc[s.user_id].weeks++
      if (s.score===s.total) acc[s.user_id].perfects++
      return acc
    }, {})
  ).sort((a,b) => b.totalPts-a.totalPts||b.perfects-a.perfects)

  return (
    <>
      <SLabel>Leaderboard</SLabel>
      <div style={{ display:'flex', gap:6, marginBottom:'1.25rem' }}>
        {['week','alltime'].map(t => (
          <button key={t} style={{ flex:1, padding:'8px', background:tab===t?'var(--stone)':'transparent',
            border:'1px solid', borderColor:tab===t?'var(--slate)':'var(--rock)', borderRadius:8,
            color:tab===t?'var(--chalk)':'var(--dust)', fontFamily:'Syne,sans-serif', fontWeight:600,
            fontSize:'0.85rem', cursor:'pointer' }}
            onClick={() => setTab(t)}>
            {t==='week' ? (week ? 'This week — ' + week.title : 'This week') : 'All-time'}
          </button>
        ))}
      </div>

      {tab==='week' && (
        weekSubs.length===0
          ? <p style={{ color:'var(--dust)', textAlign:'center', padding:'2rem' }}>No submissions this week yet.</p>
          : <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
              {weekSubs.map((s,i) => (
                <div key={s.user_id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                  background:'var(--stone)', border:'1px solid', borderColor:i===0?'var(--ore)':'var(--slate)', borderRadius:10 }}>
                  <span style={{ fontSize:'1.1rem', fontWeight:800, color:i===0?'var(--ore)':'var(--dust)', minWidth:24, textAlign:'center' }}>{i+1}</span>
                  <Avatar name={s.profiles?.full_name||'?'} size={36} />
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:600, color:'var(--chalk)', margin:0 }}>{s.profiles?.full_name||'Unknown'}</p>
                    <p style={{ fontSize:'0.75rem', color:'var(--dust)', fontFamily:'monospace', margin:0 }}>
                      {new Date(s.submitted_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                    </p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontWeight:700, fontSize:'1.2rem', color:s.score===s.total?'var(--safe)':'var(--chalk)', margin:0 }}>{s.score}/{s.total}</p>
                    {s.score===s.total && <p style={{ fontSize:'0.7rem', color:'var(--safe)', fontFamily:'monospace', margin:0 }}>perfect</p>}
                  </div>
                </div>
              ))}
            </div>
      )}

      {tab==='alltime' && (
        allTime.length===0
          ? <p style={{ color:'var(--dust)', textAlign:'center', padding:'2rem' }}>No scores yet.</p>
          : <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
              {allTime.map((p,i) => (
                <div key={p.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                  background:'var(--stone)', border:'1px solid', borderColor:i===0?'var(--ore)':'var(--slate)', borderRadius:10 }}>
                  <span style={{ fontSize:'1.1rem', fontWeight:800, color:i===0?'var(--ore)':'var(--dust)', minWidth:24, textAlign:'center' }}>{i+1}</span>
                  <Avatar name={p.name} size={36} />
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:600, color:'var(--chalk)', margin:0 }}>{p.name}</p>
                    <p style={{ fontSize:'0.75rem', color:'var(--dust)', fontFamily:'monospace', margin:0 }}>
                      {p.weeks} week{p.weeks!==1?'s':''} · {p.perfects} perfect{p.perfects!==1?'s':''}
                    </p>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <p style={{ fontWeight:700, fontSize:'1.2rem', color:'var(--ore)', margin:0 }}>{p.totalPts}</p>
                    <p style={{ fontSize:'0.7rem', color:'var(--dust)', fontFamily:'monospace', margin:0 }}>pts</p>
                  </div>
                </div>
              ))}
            </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ════════════════════════════════════════════════════════════════
function AdminPanel({ notify }) {
  const [weeks,      setWeeks]      = useState([])
  const [uploading,  setUploading]  = useState(false)
  const [status,     setStatus]     = useState('')
  const [file,       setFile]       = useState(null)
  const [title,      setTitle]      = useState('')
  const [hint,       setHint]       = useState('')
  const [qCount,     setQCount]     = useState(7)
  const [deadline,   setDeadline]   = useState('')
  const [drag,       setDrag]       = useState(false)
  const fileRef = useRef(null)

  const loadWeeks = async () => {
    const { data } = await supabase.from('quiz_weeks').select('id,week_number,title,created_at,is_active,deadline').order('week_number',{ ascending:false })
    setWeeks(data||[])
  }
  useEffect(() => { loadWeeks() }, [])

  const handleUpload = async () => {
    if (!file || !title.trim()) { notify('Add a title and select a report file', 'err'); return }
    setUploading(true)
    try {
      setStatus('Reading report…')
      const isPdf = /\.pdf$/i.test(file.name)
      const b64 = await readAsBase64(file)

      setStatus('Claude is generating questions…')
      const questions = await generateQuestions(b64, isPdf, qCount, hint)

      // Store PDF as base64 in the pdf_path column (for small PDFs < 1MB)
      // For production you'd upload to Supabase Storage instead
      const weekNum = (weeks[0]?.week_number || 0) + 1
      const { error } = await supabase.from('quiz_weeks').insert({
        week_number: weekNum,
        title: title.trim(),
        topic_hint: hint.trim() || null,
        pdf_path: isPdf ? b64 : null,
        questions,
        deadline: deadline || null,
        is_active: true
      })
      if (error) throw error

      notify(`Week ${weekNum} created — ${questions.length} questions`)
      setTitle(''); setHint(''); setFile(null); setDeadline('')
      loadWeeks()
    } catch (e) { notify('Error: ' + e.message, 'err') }
    setStatus(''); setUploading(false)
  }

  const deleteWeek = async (id) => {
    if (!confirm('Delete this week and all its submissions?')) return
    await supabase.from('quiz_weeks').delete().eq('id', id)
    loadWeeks()
    notify('Week deleted')
  }

  const toggleActive = async (id, current) => {
    await supabase.from('quiz_weeks').update({ is_active: !current }).eq('id', id)
    loadWeeks()
  }

  return (
    <>
      <SLabel>Admin panel</SLabel>

      {/* Upload new week */}
      <div style={{ ...S.card, marginBottom:'2rem' }}>
        <p style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--ore)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:'1rem' }}>Add new week</p>

        <div style={{ ...S.dropzone, ...(drag?S.dropDrag:{}), ...(file?S.dropDone:{}) }}
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)setFile(f)}}
          onClick={() => !file && fileRef.current?.click()}
          style={{ marginBottom:'1rem', ...S.dropzone, ...(drag?S.dropDrag:{}), ...(file?S.dropDone:{}) }}>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" style={{ display:'none' }} onChange={e => e.target.files[0] && setFile(e.target.files[0])} />
          {file
            ? <div style={{ textAlign:'center' }}>
                <p style={{ fontWeight:600, color:'var(--chalk)', marginBottom:4 }}>{file.name}</p>
                <p style={{ fontSize:'0.78rem', color:'var(--dust)', fontFamily:'monospace' }}>{(file.size/1024).toFixed(0)} KB</p>
                <button style={{ background:'none', border:'1px solid var(--slate)', color:'var(--dust)', padding:'4px 12px', borderRadius:20, fontSize:'0.75rem', cursor:'pointer', marginTop:'0.5rem' }}
                  onClick={e=>{e.stopPropagation();setFile(null)}}>Change file</button>
              </div>
            : <div style={{ textAlign:'center' }}>
                <p style={{ fontWeight:600, marginBottom:4 }}>Drop report here or click to browse</p>
                <p style={{ fontSize:'0.8rem', color:'var(--dust)', fontFamily:'monospace' }}>PDF · Word · TXT</p>
              </div>
          }
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'0.875rem' }}>
          <div>
            <Field label="Week title" value={title} onChange={setTitle} placeholder="e.g. Slope stability analysis" />
          </div>
          <div>
            <label style={S.lbl}>Questions to generate</label>
            <select style={S.input} value={qCount} onChange={e=>setQCount(+e.target.value)}>
              {[5,7,10,12].map(n=><option key={n} value={n}>{n} questions</option>)}
            </select>
          </div>
        </div>
        <Field label="Focus hint (optional)" value={hint} onChange={setHint} placeholder="e.g. Focus on SMR classification and failure modes" />
        <div style={{ marginTop:'0.875rem' }}>
          <Field label="Submission deadline (optional)" type="datetime-local" value={deadline} onChange={setDeadline} />
        </div>

        {status && (
          <p style={{ fontSize:'0.82rem', color:'var(--dust)', fontFamily:'monospace', display:'flex', alignItems:'center', gap:8, margin:'0.75rem 0' }}>
            <Spin />{status}
          </p>
        )}

        <Btn primary onClick={handleUpload} disabled={uploading || !file || !title.trim()} style={{ width:'100%', marginTop:'1rem' }}>
          {uploading ? <><Spin />Generating…</> : '✦ Generate questions & publish'}
        </Btn>
      </div>

      {/* Existing weeks */}
      <SLabel>Published weeks</SLabel>
      {weeks.length===0
        ? <p style={{ color:'var(--dust)', fontSize:'0.85rem' }}>No weeks published yet.</p>
        : weeks.map(w => (
          <div key={w.id} style={{ ...S.card, display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap', marginBottom:'0.625rem' }}>
            <div style={{ flex:1 }}>
              <span style={{ fontSize:'0.7rem', color:'var(--ore)', fontFamily:'monospace', fontWeight:700 }}>Week {w.week_number}</span>
              <p style={{ fontWeight:600, color:'var(--chalk)', margin:'2px 0' }}>{w.title}</p>
              <p style={{ fontSize:'0.75rem', color:'var(--seam)', fontFamily:'monospace' }}>
                {new Date(w.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                {w.deadline ? ` · Due ${new Date(w.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}` : ''}
              </p>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={() => toggleActive(w.id, w.is_active)}
                style={{ fontSize:'0.75rem', fontWeight:700, padding:'5px 12px', borderRadius:20, border:'1px solid',
                  borderColor: w.is_active?'var(--safe)':'var(--seam)',
                  color: w.is_active?'var(--safe)':'var(--seam)', background:'none', cursor:'pointer', fontFamily:'monospace' }}>
                {w.is_active?'Active':'Hidden'}
              </button>
              <Btn ghost sm danger onClick={() => deleteWeek(w.id)}>Delete</Btn>
            </div>
          </div>
        ))
      }
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// PROFILE VIEW
// ════════════════════════════════════════════════════════════════
function ProfileView({ profile, setProfile, notify }) {
  const [name, setName] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id)
    if (error) notify('Could not save: ' + error.message, 'err')
    else { setProfile({ ...profile, full_name: name.trim() }); notify('Profile updated') }
    setSaving(false)
  }

  return (
    <>
      <SLabel>Your profile</SLabel>
      <div style={{ ...S.card, maxWidth:440 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:'1.5rem' }}>
          <Avatar name={profile?.full_name||'?'} size={52} />
          <div>
            <p style={{ fontWeight:700, fontSize:'1rem', margin:0 }}>{profile?.full_name}</p>
            <p style={{ color:'var(--dust)', fontSize:'0.82rem', fontFamily:'monospace', margin:'2px 0 0' }}>
              {profile?.is_admin ? '★ Admin' : 'Team member'}
            </p>
          </div>
        </div>
        <Field label="Display name" value={name} onChange={setName} placeholder="Your full name" />
        <Btn primary onClick={save} disabled={saving} style={{ marginTop:'1rem' }}>
          {saving ? <><Spin />Saving…</> : 'Save changes'}
        </Btn>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// PDF VIEWER
// ════════════════════════════════════════════════════════════════
function PdfViewer({ b64, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    try {
      if (!b64 || b64.length < 10) { setError('No PDF data available for this report.'); return }
      const url = b64ToBlobUrl(b64)
      setBlobUrl(url)
      return () => URL.revokeObjectURL(url)
    } catch (e) {
      setError('Could not load PDF: ' + e.message)
    }
  }, [b64])

  useEffect(() => {
    const handler = e => {
      if (e.ctrlKey || e.metaKey) {
        if (['c','a','s','p','u'].includes(e.key.toLowerCase())) e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'#111', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 1.25rem', height:52, background:'var(--stone)', borderBottom:'1px solid var(--slate)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ ...S.gem, width:22, height:22 }} />
          <span style={{ fontWeight:700, fontSize:'0.9rem' }}>Report viewer</span>
          <span style={{ display:'flex', alignItems:'center', fontSize:'0.7rem', fontWeight:700, background:'rgba(58,184,122,0.15)', color:'var(--safe)', border:'1px solid rgba(58,184,122,0.3)', borderRadius:20, padding:'3px 10px', fontFamily:'monospace' }}>
            Read-only
          </span>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'1px solid var(--slate)', color:'var(--dust)', padding:'6px 14px', borderRadius:8, fontSize:'0.82rem', cursor:'pointer' }}>
          Close ✕
        </button>
      </div>
      <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
        {error && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'1rem' }}>
            <p style={{ color:'var(--fault)', fontFamily:'monospace', fontSize:'0.85rem', maxWidth:400, textAlign:'center' }}>{error}</p>
            <Btn ghost onClick={onClose}>Close</Btn>
          </div>
        )}
        {!error && !blobUrl && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
            <Spin size={36} />
          </div>
        )}
        {!error && blobUrl && (
          <>
            <iframe
              src={blobUrl}
              style={{ width:'100%', height:'100%', border:'none', display:'block' }}
              title="Report"
            />
            <div style={{ position:'absolute', inset:0, zIndex:2, cursor:'default', userSelect:'none', WebkitUserSelect:'none', pointerEvents:'none' }}
              onContextMenu={e=>e.preventDefault()} />
          </>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════════════════════════
function Avatar({ name, size=36 }) {
  const cols = ['#E8A020','#4A9EFF','#3AB87A','#A970FF','#FF7A50','#50C8C8','#FF6090']
  const c = cols[(name.charCodeAt(0)||0) % cols.length]
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:c+'22', border:`1px solid ${c}44`,
      display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.38,
      fontWeight:700, color:c, flexShrink:0, fontFamily:'monospace' }}>
      {initials(name)}
    </div>
  )
}

function Btn({ children, primary, ghost, sm, large, danger, onClick, disabled, style:sx }) {
  const base = { display:'inline-flex', alignItems:'center', gap:6, borderRadius:10,
    fontFamily:'Syne,sans-serif', fontWeight:700, cursor:disabled?'not-allowed':'pointer',
    border:'none', transition:'opacity 0.15s', opacity:disabled?0.4:1 }
  const sz = large ? { padding:'14px 40px', fontSize:'1rem' }
           : sm    ? { padding:'7px 14px',  fontSize:'0.8rem' }
                   : { padding:'10px 20px', fontSize:'0.88rem' }
  const v = primary ? { background:'var(--ore)', color:'var(--rock)' }
          : ghost   ? { background:'transparent', color: danger?'var(--fault)':'var(--dust)',
                        border:'1px solid', borderColor:danger?'var(--fault)':'var(--slate)' }
                    : {}
  return <button style={{ ...base, ...sz, ...v, ...sx }} onClick={onClick} disabled={disabled}>{children}</button>
}

function Field({ label, value, onChange, placeholder, type='text', onEnter }) {
  return (
    <div style={{ marginBottom:'0.875rem' }}>
      <label style={S.lbl}>{label}</label>
      <input type={type} style={S.input} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key==='Enter' && onEnter && onEnter()} />
    </div>
  )
}

function Loader({ text, inline }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      ...(inline ? { padding:'4rem 2rem' } : { minHeight:'100vh' }), gap:'1rem' }}>
      <div style={{ width:32, height:32, border:'2.5px solid rgba(240,237,232,0.1)', borderTopColor:'var(--ore)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <p style={{ color:'var(--dust)', fontSize:'0.85rem', fontFamily:'monospace' }}>{text}</p>
    </div>
  )
}

function EmptyState({ text, onBack }) {
  return (
    <div style={{ textAlign:'center', padding:'4rem 2rem' }}>
      <p style={{ color:'var(--dust)', marginBottom:'1.5rem' }}>{text}</p>
      {onBack && <Btn ghost onClick={onBack}>← Back</Btn>}
    </div>
  )
}

function Notif({ msg, type }) {
  return (
    <div style={{ position:'fixed', top:'1.5rem', right:'1.5rem', zIndex:9999,
      background:type==='ok'?'var(--safe)':'var(--fault)', color:'var(--rock)',
      padding:'10px 20px', borderRadius:10, fontWeight:700, fontSize:'0.88rem',
      animation:'fadeIn 0.2s ease', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }}>
      {msg}
    </div>
  )
}

function Spin({ size=14 }) {
  return <span style={{ display:'inline-block', width:size, height:size, border:'2px solid rgba(240,237,232,0.2)',
    borderTopColor:'currentColor', borderRadius:'50%', animation:'spin 0.7s linear infinite', verticalAlign:'middle' }} />
}

function SLabel({ children, style:sx }) {
  return <p style={{ fontSize:'0.72rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase',
    color:'var(--ore)', marginBottom:'0.75rem', ...sx }}>{children}</p>
}

function EyeIcon() {
  return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx={12} cy={12} r={3}/></svg>
}

// ─── STYLE TOKENS ────────────────────────────────────────────────
const S = {
  gem:     { background:'var(--ore)', clipPath:'polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%)' },
  card:    { background:'var(--stone)', border:'1px solid var(--slate)', borderRadius:12, padding:'1.25rem 1.5rem', marginBottom:'0.75rem' },
  tab:     { flex:1, padding:'8px', background:'transparent', border:'1px solid var(--rock)', borderRadius:8, color:'var(--dust)', fontFamily:'Syne,sans-serif', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' },
  tabActive:{ background:'var(--stone)', borderColor:'var(--slate)', color:'var(--chalk)' },
  lbl:     { display:'block', fontSize:'0.75rem', fontWeight:600, color:'var(--dust)', marginBottom:6, letterSpacing:'0.05em' },
  input:   { width:'100%', background:'var(--rock)', border:'1px solid var(--slate)', borderRadius:10, padding:'10px 12px', color:'var(--chalk)', fontFamily:'Syne,sans-serif', fontSize:'0.9rem', outline:'none' },
  dropzone:{ border:'1.5px dashed var(--seam)', borderRadius:12, padding:'2rem 1.5rem', textAlign:'center', cursor:'pointer', transition:'border-color 0.2s,background 0.2s' },
  dropDrag:{ borderColor:'var(--ore)', background:'rgba(232,160,32,0.05)' },
  dropDone:{ borderColor:'var(--vein)', background:'rgba(74,158,255,0.04)', cursor:'default' },
}
