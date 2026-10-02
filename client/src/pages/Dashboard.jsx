import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/auth.js";
import { API_URL } from "../config/api.js";

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const student = user.role === "student";
  const admin = user.role === "admin";
  useEffect(()=>{
    const controller = new AbortController();
    Promise.all(["groups", "groups/requests", "attempts/mine", ...(!student ? ["quizzes/mine"] : [])].map(async path=>{
      const response=await fetch(`${API_URL}/api/${path}`,{credentials:"include",signal:controller.signal});
      if(!response.ok) throw new Error("Your overview could not be loaded. Use the links below or refresh to try again.");
      return response.json();
    })).then(([groups, requests, attempts, quizzes])=>setSummary({groups:groups.groups,requests:requests.requests,attempts:attempts.attempts,quizzes:quizzes?.quizzes || []})).catch(error=>{if(error.name!=="AbortError")setError(error.message);});
    return ()=>controller.abort();
  },[student]);
  const pending = summary?.requests.filter(r=>r.canRespond).length;
  const actions = student ? [
    ["/assignments", "Your next classroom challenge", "See assigned quizzes, deadlines, and your classroom results.", "View assignments"],
    ["/groups", "Your learning community", "Accept invitations or request to join a classroom.", "Open classrooms"],
    ["/attempts", "See how far you've come", "Revisit your scores and previous attempts.", "View my progress"],
  ] : [
    ["/quizzes/create", "Turn ideas into questions", "Build your next quiz and publish it when you're ready.", "Create a quiz"],
    ["/groups", admin ? "Oversee your classrooms" : "Bring your class together", "Review join requests, invite students, and manage memberships.", "Manage classrooms"],
    ["/assignments", "Assignments & classroom progress", "Deliver quizzes and review results for each classroom separately.", "Manage assignments"],
  ];
  return <main><section className="dashboard-welcome"><div><span className="eyebrow">{admin ? "PLATFORM ADMIN" : student ? "YOUR LEARNING SPACE" : "YOUR TEACHING SPACE"}</span><h1>Hello, {user.name.split(" ")[0]}<span className="accent-dot">.</span></h1><p>{student ? "A fresh question. A new perspective. What will you learn today?" : admin ? "Keep QuizVerse classrooms connected and content organized." : "Great learning starts with you. Let's build something worth discovering."}</p></div><Link className="btn btn-primary btn-large" to={student ? "/browse" : "/quizzes/create"}>{student ? "Find a quiz" : "+ Create quiz"}</Link></section>
    {error && <p className="feedback feedback-error" role="alert">{error}</p>}
    <section className="stats-grid" aria-label="Your overview" aria-busy={!summary && !error}>{[[admin ? "All classrooms" : "My classrooms", summary?.groups.length], ["Awaiting your response", pending], [student ? "Completed attempts" : admin ? "Platform quizzes" : "My quizzes", student ? summary?.attempts.length : summary?.quizzes.length]].map(([label,value])=><div className="stat-card" key={label}><span>{label}</span><strong>{value ?? (error ? "Unavailable" : "Loading...")}</strong></div>)}</section>
    {pending > 0 && <div className="attention-card"><div><strong>{pending} {pending===1 ? "request needs" : "requests need"} your attention</strong><p>{student ? "Your next classroom could be one invitation away." : "Students are waiting to join their classroom."}</p></div><Link to="/groups#requests" className="btn btn-secondary">Review now</Link></div>}
    <section className="dashboard-grid">{actions.map(([url,title,copy,cta],i)=><Link className="dashboard-card" to={url} key={url}><span className="feature-number">0{i+1}</span><h2>{title}</h2><p>{copy}</p><span className="text-link">{cta} →</span></Link>)}</section>
    {student && summary?.attempts.length > 0 && <section className="panel"><div className="section-row"><h2>Your latest result</h2><Link className="text-link" to="/attempts">All attempts →</Link></div><p>{summary.attempts[0].quiz?.title || "Deleted quiz"}</p><strong className="latest-score">{Math.round(summary.attempts[0].percentage)}%</strong><p>{summary.attempts[0].score} / {summary.attempts[0].totalMarks} marks</p></section>}
    {!student && summary && <section className="panel">
      <div className="section-row"><div><span className="eyebrow">{admin ? "CONTENT OVERVIEW" : "PICK UP WHERE YOU LEFT OFF"}</span><h2>{admin ? "Recently updated platform quizzes" : "Your latest quizzes"}</h2></div><Link className="text-link" to="/quizzes">View all quizzes →</Link></div>
      {summary.quizzes.length === 0 ? <div className="empty-inline"><h3>{admin ? "No platform quizzes yet" : "Your first quiz starts with an idea"}</h3><p>Create a draft, add your questions, and publish when you are ready.</p><Link className="btn btn-primary" to="/quizzes/create">Create a quiz</Link></div> : <div className="dashboard-quiz-list">{summary.quizzes.slice(0, 3).map(quiz => <Link className="dashboard-quiz-row" key={quiz._id} to={`/quizzes/${quiz._id}/edit`}><div><strong>{quiz.title}</strong><span>{quiz.category} · {quiz.questions.length} questions</span></div><span className={`status-badge status-${quiz.status}`}>{quiz.status}</span></Link>)}</div>}
    </section>}
    {!student && <p className="muted">Open an assignment to view its frozen roster, completion rate, and individual student results.</p>}
    <p><Link className="btn btn-secondary" to="/notifications">View classroom notifications</Link></p><section className="identity-card"><div><span className="eyebrow">YOUR QUIZVERSE ID</span><strong>{user.publicId || "ID not assigned yet"}</strong><p>Use this ID when connecting with your classroom.</p></div><span className="pill">{user.role}</span></section>
  </main>;
}
