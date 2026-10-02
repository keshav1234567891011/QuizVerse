import { useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth.js";

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const [openPath, setOpenPath] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const open = openPath === location.pathname;
  const toggleRef = useRef(null);
  const closeMenu = () => setOpenPath(null);
  const navigate = useNavigate();
  const canTeach = ["teacher", "admin"].includes(user?.role);
  async function handleLogout() {
    setBusy(true); setError("");
    try { await logout(); closeMenu(); navigate("/login"); }
    catch { setError("Could not sign out. Please try again."); }
    finally { setBusy(false); }
  }
  return <><a className="skip-link" href="#main-content">Skip to content</a><header className="navbar">
    <div className="navbar-container"><Link to="/" className="navbar-logo" onClick={closeMenu}><span className="brand-mark">Q</span>QuizVerse</Link>
      <button ref={toggleRef} className="nav-toggle btn btn-secondary" aria-expanded={open} aria-controls="primary-navigation" onClick={()=>setOpenPath(open ? null : location.pathname)}>{open ? "Close menu" : "Open menu"}</button>
      <nav id="primary-navigation" aria-label="Main navigation" className={`navbar-links ${open ? "nav-open" : ""}`} onClick={e=>{if(e.target.closest("a"))closeMenu();}} onKeyDown={e=>{if(e.key === "Escape"){closeMenu();toggleRef.current?.focus();}}}>
        <NavLink to="/" end>Home</NavLink><NavLink to="/browse">Browse</NavLink>
        {user ? <><NavLink to="/dashboard">Dashboard</NavLink><NavLink to="/groups">Classrooms</NavLink>{canTeach && <NavLink to="/quizzes">{user.role === "admin" ? "Quizzes" : "My quizzes"}</NavLink>}<NavLink to="/attempts">My attempts</NavLink><span className="nav-role">{user.role}</span><button className="btn btn-secondary" disabled={busy} onClick={handleLogout}>{busy ? "Signing out..." : "Sign out"}</button></> : !loading && <><NavLink to="/login">Log in</NavLink><Link className="btn btn-primary" to="/register">Get started</Link></>}
      </nav>
    </div>{error && <p className="nav-error" role="alert">{error}</p>}
  </header></>;
}
