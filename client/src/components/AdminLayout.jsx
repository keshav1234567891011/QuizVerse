import { NavLink, Outlet } from "react-router-dom";
export default function AdminLayout() {
  return <main className="admin-area"><header className="page-toolbar"><div><span className="eyebrow">QUIZVERSE ADMINISTRATION</span><h1>Platform management</h1><p>Manage accounts, moderate content, and inspect classroom progress.</p></div></header>
    <nav className="admin-nav" aria-label="Administration">{[["", "Overview"], ["users", "Users"], ["quizzes", "Quizzes"], ["groups", "Classrooms"], ["assignments", "Assignments"], ["attempts", "Attempts"]].map(([path, label]) => <NavLink key={path} to={`/admin${path ? `/${path}` : ""}`} end>{label}</NavLink>)}</nav><Outlet /></main>;
}
