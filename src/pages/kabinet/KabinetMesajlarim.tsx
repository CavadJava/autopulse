import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getMyConversations, getMessages, sendMessage, ChatUnauthorizedError } from '../../api/chat';
import type { Conversation, ChatMessage } from '../../api/chat';
import { getRealListingById } from '../../api/listings';
import type { ApiListing } from '../../api/listings';
import styles from './KabinetMesajlarim.module.css';

const POLL_INTERVAL_MS = 4000;

export default function KabinetMesajlarim() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    searchParams.get('c') ? Number(searchParams.get('c')) : null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedListing, setSelectedListing] = useState<ApiListing | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadConversations = async () => {
    try {
      const data = await getMyConversations();
      setConversations(data);
    } catch (err) {
      if (err instanceof ChatUnauthorizedError) {
        setError('Kabinetə giriş etməmisiniz.');
      }
    }
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv) {
      setSelectedListing(null);
      return;
    }
    getRealListingById(conv.source, conv.listingId)
      .then(setSelectedListing)
      .catch(() => setSelectedListing(null));
  }, [selectedId, conversations]);

  useEffect(() => {
    if (selectedId === null) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const data = await getMessages(selectedId);
        setMessages(data);
      } catch {
        // Polling failure is non-fatal — keep showing the last known messages.
      }
    };

    loadMessages();
    pollRef.current = setInterval(loadMessages, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId]);

  const selectConversation = (id: number) => {
    setSelectedId(id);
    setSearchParams({ c: String(id) });
  };

  const handleSend = async () => {
    if (!draft.trim() || selectedId === null) return;
    setSending(true);
    try {
      await sendMessage(selectedId, draft.trim());
      setDraft('');
      const data = await getMessages(selectedId);
      setMessages(data);
    } catch {
      setError('Mesaj göndərilərkən xəta baş verdi.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.page}>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.layout}>
        <div className={styles.conversationList}>
          {conversations.length === 0 ? (
            <p className={styles.empty}>Hələ heç bir mesajınız yoxdur.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                className={c.id === selectedId ? styles.conversationItemActive : styles.conversationItem}
                onClick={() => selectConversation(c.id)}
              >
                Elan #{c.listingId} ({c.source === 'shop' ? 'Mağaza' : 'İstifadəçi'})
              </button>
            ))
          )}
        </div>

        <div className={styles.messagePane}>
          {selectedId === null ? (
            <p className={styles.empty}>Bir konuşma seçin.</p>
          ) : (
            <>
              {selectedListing && (
                <Link
                  to={`/elan/${selectedListing.source}-${selectedListing.id}`}
                  className={styles.listingHeader}
                >
                  {selectedListing.images[0] && (
                    <img
                      src={selectedListing.images[0].minioUrl || selectedListing.images[0].s3Url}
                      alt={selectedListing.title}
                      className={styles.listingHeaderImage}
                    />
                  )}
                  <span className={styles.listingHeaderTitle}>{selectedListing.title}</span>
                  <span className={styles.listingHeaderLink}>Elana bax →</span>
                </Link>
              )}
              <div className={styles.messages}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={m.senderType === 'user' ? styles.messageMine : styles.messageTheirs}
                  >
                    {m.body}
                  </div>
                ))}
              </div>
              <div className={styles.composer}>
                <input
                  className={styles.input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Mesajınızı yazın..."
                />
                <button className={styles.sendBtn} onClick={handleSend} disabled={sending || !draft.trim()}>
                  Göndər
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
