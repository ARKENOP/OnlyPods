import './App.css';
import { useEffect, useState } from 'react';

function App() {
  const [messages, setMessages] = useState([]);
  const [formData, setFormData] = useState({ author: '', content: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const fetchMessages = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/messages');
        if (!response.ok) {
          throw new Error('Impossible de charger les messages.');
        }
        const data = await response.json();
        if (active) {
          setMessages(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchMessages();

    return () => {
      active = false;
    };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const author = formData.author.trim();
    const content = formData.content.trim();
    if (!author || !content || submitting) {
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, content }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Impossible de publier le message.');
      }

      const created = await response.json();
      setMessages((current) => [created, ...current]);
      setFormData({ author: '', content: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    formData.author.trim().length > 0 && formData.content.trim().length > 0 && !submitting;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="app-tagline">Mini réseau social conteneurisé</p>
          <h1>OnlyPods</h1>
        </div>
      </header>

      <main className="app-main">
        {error ? <div className="error">{error}</div> : null}

        <section className="card">
          <h2>Publier un message</h2>
          <form className="message-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Auteur</span>
              <input
                name="author"
                type="text"
                placeholder="Votre nom"
                value={formData.author}
                onChange={handleChange}
                maxLength={255}
                autoComplete="name"
                required
              />
            </label>

            <label className="field">
              <span>Contenu</span>
              <textarea
                name="content"
                placeholder="Votre message"
                value={formData.content}
                onChange={handleChange}
                rows={4}
                required
              />
            </label>

            <button type="submit" disabled={!canSubmit}>
              {submitting ? 'Publication…' : 'Publier'}
            </button>
          </form>
        </section>

        <section className="card feed">
          <div className="feed-header">
            <h2>Fil d&apos;actualité</h2>
            <span className="feed-count">{messages.length} message(s)</span>
          </div>

          {loading ? (
            <p className="muted">Chargement des messages…</p>
          ) : messages.length === 0 ? (
            <p className="muted">Aucun message pour le moment.</p>
          ) : (
            <ul className="message-list">
              {messages.map((message) => {
                const date = message.created_at ? new Date(message.created_at) : null;
                const formattedDate =
                  date && !Number.isNaN(date.getTime())
                    ? new Intl.DateTimeFormat('fr-FR', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(date)
                    : null;

                return (
                  <li key={message.id ?? `${message.author}-${message.created_at}`}>
                    <div className="message-meta">
                      <span className="message-author">{message.author}</span>
                      {formattedDate ? (
                        <span className="message-date">{formattedDate}</span>
                      ) : null}
                    </div>
                    <p className="message-content">{message.content}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
