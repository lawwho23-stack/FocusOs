import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleCheck,
  Lightbulb,
  Moon,
  Orbit,
  Plus,
  Sparkles,
  Sun,
  Target,
  Timer,
} from "lucide-react";
import LandingMotion from "./landing-motion";
import styles from "./welcome.module.css";

export const metadata: Metadata = {
  title: "FocusOS — Take back your attention",
  description: "Give your day a direction. Choose a daily mission, make time for focused work, capture ideas, and reflect with your AI coach.",
};

function OrbitArt() {
  return (
    <div className={styles.orbitArt} aria-hidden="true">
      <div className={styles.orbitGlow} />
      <svg className={styles.orbitSphere} viewBox="0 0 600 600" fill="none">
        <circle cx="300" cy="300" r="236" />
        {Array.from({ length: 17 }, (_, i) => (
          <ellipse key={i} cx="300" cy="300" rx={24 + i * 13.25} ry="236" transform="rotate(-28 300 300)" />
        ))}
        {Array.from({ length: 13 }, (_, i) => {
          const position = (i - 6) / 7;
          return <ellipse key={i} cx="300" cy={300 + position * 236} rx={Math.sqrt(1 - position * position) * 236} ry="35" transform="rotate(-28 300 300)" />;
        })}
      </svg>
      <div className={styles.orbitTrack}><span /></div>
      <div className={styles.orbitTrackInner}><span /></div>
      <span className={styles.artCoordinate}>01 / ATTENTION</span>
      <span className={styles.artCaption}>A LITTLE DIRECTION.<br />A DIFFERENT DAY.</span>
    </div>
  );
}

function ExampleDay() {
  return (
    <figure className={styles.preview} aria-labelledby="example-caption" data-reveal>
      <figcaption id="example-caption" className={styles.previewBar}>
        <span><Orbit size={17} aria-hidden="true" /> FocusOS</span>
        <span className={styles.exampleLabel}>Example day</span>
        <span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span>
      </figcaption>
      <div className={styles.previewBody}>
        <div className={styles.previewSidebar} aria-hidden="true">
          <span className={styles.previewNavActive}><Sun size={15} /> My day</span>
          <span><Target size={15} /> Goals</span>
          <span><Lightbulb size={15} /> Planning</span>
          <span><Timer size={15} /> Focus</span>
          <span><Moon size={15} /> Reflection</span>
          <div className={styles.previewSidebarBottom}>WORK HARD.<br />STAY CONSISTENT.<br />MOVE FORWARD.</div>
        </div>
        <div className={styles.previewMission}>
          <p className={styles.eyebrow}>A DAY WITH DIRECTION</p>
          <h2>Make room for<br />what matters.</h2>
          <div className={styles.missionCard}>
            <span className={styles.cardLabel}><Target size={14} aria-hidden="true" /> TODAY’S MISSION</span>
            <h3>Bring the first draft to life.</h3>
            <p>One clear outcome. A few small steps.</p>
            <div className={styles.taskDone}><CircleCheck size={17} aria-hidden="true" /><span>Choose the main idea</span><span>10 min</span></div>
            <div className={styles.taskCurrent}><span className={styles.taskDot} /><span>Write the first draft</span><span>25 min</span></div>
            <div className={styles.taskNext}><span className={styles.taskDot} /><span>Review and simplify</span><span>15 min</span></div>
          </div>
        </div>
        <div className={styles.previewFocus}>
          <span className={styles.cardLabel}><Timer size={14} aria-hidden="true" /> FOCUS SESSION</span>
          <div className={styles.timerRing}><div><strong>25:00</strong><span>ONE TASK AT A TIME</span></div></div>
          <p>Write the first draft</p>
          <div className={styles.focusStatus}><span /> A little space to go deeper</div>
        </div>
      </div>
    </figure>
  );
}

const questions = [
  { question: "Where do I start?", answer: "Open FocusOS and choose a daily mission: one outcome that would make today meaningful. Break it into small tasks, then start a focus session for the next step." },
  { question: "What if I have more ideas than time?", answer: "Keep those ideas in Planning. You can capture a rough thought now and return to it later, without adding it to today’s mission." },
  { question: "How does the AI Coach help?", answer: "The coach uses your recorded work and reflections to help you think through blockers, recognize patterns, and choose a practical next step." },
  { question: "What happens when a day doesn’t go to plan?", answer: "Record what got in the way in Reflection. Review what you finished, what interrupted you, and the next action you want to take. Progress is a record you can learn from." },
];

export default function WelcomePage() {
  return (
    <LandingMotion className={styles.landing}>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <nav className={styles.navigation} aria-label="Landing page">
          <div className={styles.navLinks}><a href="#system">THE SYSTEM</a><a href="#features">FEATURES</a></div>
          <a className={styles.brand} href="/welcome" aria-label="FocusOS home"><Orbit size={24} aria-hidden="true" /><span>FOCUS<span className={styles.brandOs}>OS</span></span></a>
          <div className={styles.navEnd}><a href="#questions" className={styles.faqLink}>QUESTIONS</a><Link href="/" prefetch={false} className={styles.navCta}>OPEN FOCUSOS <ArrowRight size={14} aria-hidden="true" /></Link></div>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.heroCopy}>
            <p className={`${styles.eyebrow} ${styles.heroIntro}`}><span className={styles.liveDot} /> YOUR PERSONAL FOCUS SYSTEM</p>
            <h1 id="hero-heading" className={styles.heroTitle}><span>Take back</span><span>your</span><span className={styles.gold}>attention.</span></h1>
            <p className={styles.heroDescription}>Less scattered. More intentional.<br />A daily mission, focused work, and a little guidance.<br className={styles.desktopBreak} /> Make progress on the things you care about.</p>
            <div className={styles.heroActions}><Link href="/" prefetch={false} className={styles.primaryButton}>OPEN FOCUSOS <ArrowRight size={17} aria-hidden="true" /></Link><a href="#system" className={styles.secondaryButton}>EXPLORE THE SYSTEM <ArrowDown size={16} aria-hidden="true" /></a></div>
            <div className={styles.heroFootnote}><span>WORK HARD</span><i aria-hidden="true" /><span>CONSISTENCY</span><i aria-hidden="true" /><span>FORWARD</span></div>
          </div>
          <OrbitArt />
        </section>

        <div className={styles.container}><ExampleDay /></div>

        <section id="system" className={`${styles.system} ${styles.container}`} aria-labelledby="system-heading">
          <div className={styles.sectionHeading} data-reveal><p className={styles.eyebrow}>A SIMPLE DAILY RHYTHM</p><h2 id="system-heading">Direction before motion.</h2><p>You don’t need to do everything.<br />You need to know what to do next.</p></div>
          <div className={styles.rhythmGrid}>
            {[{ number: "01", label: "CHOOSE", title: "One clear mission.", text: "Decide what matters today. Give your work a finish line.", icon: Target }, { number: "02", label: "FOCUS", title: "A little protected time.", text: "Pick a task. Start a session. Give it your full attention.", icon: Timer }, { number: "03", label: "REFLECT", title: "Something to build on.", text: "Look back honestly. Take the lesson into tomorrow.", icon: Moon }].map((step) => (
              <article key={step.number} className={styles.rhythmCard} data-reveal><div className={styles.rhythmTop}><span>{step.number} / {step.label}</span><step.icon size={26} strokeWidth={1.2} aria-hidden="true" /></div><h3>{step.title}</h3><p>{step.text}</p></article>
            ))}
          </div>
        </section>

        <section id="features" className={`${styles.features} ${styles.container}`} aria-labelledby="features-heading">
          <div className={styles.featureHeading} data-reveal><h2 id="features-heading">Built for your<br /><span className={styles.gold}>next step.</span></h2><p>A place for your work.<br />And space for the person doing it.</p><Orbit size={42} strokeWidth={1} aria-hidden="true" /></div>
          <div className={styles.featureGrid}>
            <article className={styles.feature} data-reveal><p className={styles.eyebrow}>#1 / DAILY MISSIONS</p><h3>Give today a direction.</h3><p>Turn a project into one meaningful outcome. Break it into tasks small enough to start, clear enough to finish.</p><div className={`${styles.featureVisual} ${styles.missionVisual}`} aria-hidden="true"><div className={styles.targetRings}><Target size={100} strokeWidth={0.65} /></div><div className={styles.visualChip}><Check size={15} /> ONE THING THAT MATTERS</div><span className={styles.visualCorner}>01 / CHOOSE</span></div></article>
            <article className={styles.feature} data-reveal><p className={styles.eyebrow}>#2 / FOCUS SESSIONS</p><h3>Go a little deeper.</h3><p>Make time for a single task. Record the work you did and the interruptions you noticed. Let each session teach you something.</p><div className={`${styles.featureVisual} ${styles.focusVisual}`} aria-hidden="true"><div className={styles.smallTimer}><span>25:00</span><small>FOCUS, ONE SESSION AT A TIME</small></div><span className={styles.visualCorner}>02 / FOCUS</span></div></article>
            <article className={styles.feature} data-reveal><p className={styles.eyebrow}>#3 / PLANNING</p><h3>Keep the idea. Lose the noise.</h3><p>A thought for later doesn’t have to become a task for today. Capture ideas in their own space, then return when you’re ready.</p><div className={`${styles.featureVisual} ${styles.planningVisual}`} aria-hidden="true"><div className={styles.ideaSlip}><Lightbulb size={18} /><span>A thought for later</span><i /></div><div className={styles.ideaSlip}><Plus size={18} /><span>Room for the next idea</span><i /></div><span className={styles.visualCorner}>03 / MAKE SPACE</span></div></article>
            <article id="coach" className={styles.feature} data-reveal><p className={styles.eyebrow}>#4 / AI COACH</p><h3>A little perspective helps.</h3><p>Think through what’s getting in your way with a coach that uses your work and reflections. Find a practical next step, then get back to it.</p><div className={`${styles.featureVisual} ${styles.coachVisual}`}><Image src="/coach-lion.png" alt="" width={190} height={190} className={styles.coachLion} /><div className={styles.coachPrompt}><Sparkles size={14} aria-hidden="true" /> Start with one small step.</div><span className={styles.visualCorner}>04 / KEEP GOING</span></div></article>
          </div>
        </section>

        <section id="questions" className={`${styles.questions} ${styles.container}`} aria-labelledby="questions-heading">
          <div data-reveal><p className={styles.eyebrow}>A LITTLE CLARITY</p><h2 id="questions-heading">Good questions.</h2><p>Start simple. Find your rhythm.</p></div>
          <div className={styles.questionList} data-reveal>{questions.map(({ question, answer }) => <details className={styles.question} key={question}><summary>{question}<Plus size={20} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
        </section>

        <section className={`${styles.closing} ${styles.container}`} aria-labelledby="closing-heading" data-reveal><p className={styles.eyebrow}>YOUR NEXT STEP IS WAITING</p><h2 id="closing-heading">Make room for<br /><span className={styles.gold}>what matters.</span></h2><Link href="/" prefetch={false} className={styles.primaryButton}>OPEN FOCUSOS <ArrowRight size={17} aria-hidden="true" /></Link><p className={styles.closingTagline}>Work Hard / Consistency / Forward</p></section>
      </main>

      <footer className={`${styles.footer} ${styles.container}`}><div className={styles.footerWordmark} aria-hidden="true">FOCUS<span>OS</span></div><div className={styles.footerBottom}><span><Orbit size={15} aria-hidden="true" /> FocusOS · A little direction, every day.</span><div><a href="#features">FEATURES</a><a href="#questions">QUESTIONS</a><a href="#main">BACK TO TOP ↑</a></div></div></footer>
    </LandingMotion>
  );
}
