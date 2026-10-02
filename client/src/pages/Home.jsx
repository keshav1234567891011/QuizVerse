import { Link } from "react-router-dom";

export default function Home() {
  return <main className="landing">
    <section className="landing-hero">
      <div><span className="eyebrow">A LITTLE CURIOSITY. A WORLD OF POSSIBILITY.</span>
        <h1>Big ideas start with<br /><em>one good question.</em></h1>
        <p className="hero-copy">Make learning an everyday discovery. Find your next challenge, bring your classroom together, and see how far your knowledge can go.</p>
        <div className="action-row"><Link className="btn btn-primary btn-large" to="/register?role=student">I'm a student <span aria-hidden="true">✦</span></Link><Link className="btn btn-secondary btn-large" to="/register?role=teacher">I'm a teacher</Link></div>
        <Link className="text-link" to="/browse">Explore public quizzes <span aria-hidden="true">✦</span></Link>
        <div className="hero-notes"><span>Learn at your pace</span><span>Your classroom, connected</span></div>
      </div>
      <div className="hero-preview" aria-label="Example QuizVerse learning experience">
        <div className="preview-top"><span className="brand-mark">Q</span><span>YOUR DAILY DOSE OF DISCOVERY</span><span aria-hidden="true">✦</span></div>
        <div className="preview-question"><span className="pill">SCIENCE · SAMPLE QUESTION</span><h2>What powers the<br />northern lights?</h2><div className="preview-option">A <span>Reflected moonlight</span></div><div className="preview-option preview-selected">B <span>Charged particles from the Sun</span><span aria-hidden="true">✦</span></div><div className="preview-option">C <span>Light from distant stars</span></div></div>
        <div className="preview-footer"><span>Every question is a new perspective.</span><strong>Keep exploring ↗</strong></div>
        <div className="floating-note"><span aria-hidden="true">✦</span><div><strong>Small steps. Real progress.</strong><span>Build confidence, one quiz at a time.</span></div></div>
      </div>
    </section>
    <section className="landing-section"><div className="section-heading"><span className="eyebrow">BUILT FOR YOUR NEXT AHA MOMENT</span><h2>A place to learn. A space to teach.</h2><p>Everything you need to turn curiosity into a habit.</p></div>
      <div className="feature-grid">{[
        ["01", "Find your next challenge", "Explore quizzes by topic and difficulty. Try something familiar or discover a whole new interest."],
        ["02", "Bring your class together", "Create a classroom, send invitations, and let students request to join with a simple group code."],
        ["03", "Make every attempt count", "Get your results after each quiz and revisit your saved attempts to see your learning journey."],
      ].map(([n,title,copy])=><article className="feature-card" key={n}><span className="feature-number">{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>
    <section className="how-section"><div><span className="eyebrow">FROM CURIOUS TO CONFIDENT</span><h2>How QuizVerse Works</h2><p>A simple start. Plenty of room to grow.</p><Link to="/browse" className="btn btn-primary">Browse Quizzes</Link></div><ol className="steps"><li><strong>Make yourself at home</strong><p>Choose a student or teacher account and get your own QuizVerse ID.</p></li><li><strong>Find your people and your topics</strong><p>Explore public quizzes or connect with a classroom through an invitation or join request.</p></li><li><strong>Learn, reflect, repeat</strong><p>Students play and review results. Teachers create quizzes and manage their classrooms.</p></li></ol></section>
    <section className="landing-cta"><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h2>Stay curious. Keep growing.</h2><Link className="btn btn-primary btn-large" to="/register">Join QuizVerse</Link></section>
    <footer className="site-footer"><strong>QuizVerse</strong><span>Made for curious minds.</span><Link to="/browse">Explore quizzes</Link></footer>
  </main>;
}
