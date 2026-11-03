import { useEffect, useId, useRef, useState } from "react";

/** The signed-in person. A demo stand-in; add `photo` (an image URL) to show a picture. */
const USER = { name: "Jillian Phan", role: "BI Developer" };

/**
 * Signing out: the app has no accounts yet, so this starts over on the home page.
 */
const signOut = () => { location.href = location.pathname; };

/**
 * The signed-in person, at the right of each page's top bar: just the picture (or initials when there's no picture
 * or it can't load). Clicking it opens a card with the name, role and Sign out; a click elsewhere or Escape closes it.
 */
export default function UserBadge({ user = USER }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const ref = useRef(null);
  const button = useRef(null);
  const cardId = useId(); // each page has its own badge
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { setOpen(false); button.current.focus(); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const initials = user.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const avatar = (size) => (broken || !user.photo
    ? <span className="user-avatar" style={{ width: size, height: size }} aria-hidden="true">{initials}</span>
    : <img className="user-avatar" src={user.photo} alt="" width={size} height={size} onError={() => setBroken(true)} />);

  return (
    <div className="user-badge" ref={ref}>
      <button type="button" className="user-btn" ref={button} onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-controls={cardId} aria-label={`${user.name}: account`} title={user.name}>
        {avatar(32)}
      </button>
      {open && (
        <div className="user-card" id={cardId}>
          <div className="user-card-head">
            {avatar(40)}
            <div className="user-text">
              <p className="user-name">{user.name}</p>
              <p className="user-role">{user.role}</p>
            </div>
          </div>
          <button type="button" className="user-signout" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
