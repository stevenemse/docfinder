import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Bell, CheckCheck, PackageCheck, Wallet, Clock, XCircle, Store, BadgeCheck, Inbox } from 'lucide-react';
import { dataService } from '../services/dataService';
import type { AppNotification } from '../types';

const POLL_MS = 30_000;

const ICONS: Record<string, React.ReactNode> = {
  deposit_confirmed: <PackageCheck size={16} color="var(--primary-600)" />,
  payment_received: <Wallet size={16} color="var(--gold-600, #b7791f)" />,
  escrow_refunded: <BadgeCheck size={16} color="var(--green-600, #276749)" />,
  withdrawal_requested: <Wallet size={16} color="var(--gold-600, #b7791f)" />,
  withdrawal_processed: <Wallet size={16} color="var(--primary-600)" />,
  partner_approved: <BadgeCheck size={16} color="var(--green-600, #276749)" />,
  partner_registered: <Store size={16} color="var(--gold-600, #b7791f)" />,
  partner_suspended: <XCircle size={16} color="var(--red-600, #c53030)" />,
  pickup_reminder: <Clock size={16} color="var(--gold-600, #b7791f)" />,
  handover_expired: <Clock size={16} color="var(--red-600, #c53030)" />
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l\u2019instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86_400)} j`;
}

interface Props {
  enabled: boolean; // false → visiteur non connecté
}

/** Cloche de notifications in-app : panneau déroulant, polling 30 s, tout marquer lu. */
export const NotificationBell: React.FC<Props> = ({ enabled }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await dataService.getMyNotifications();
      setItems(Array.isArray(list) ? list : []);
    } catch {
      // silencieux — jamais bloquer la nav pour des notifs
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [enabled, refresh]);

  // Fermeture au clic extérieur
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!enabled) return null;

  const unread = items.filter(n => !n.read).length;

  const markAll = async () => {
    const ids = items.filter(n => !n.read).map(n => n.id);
    await dataService.markNotificationsRead(ids);
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`}
        onClick={() => { setOpen(o => !o); refresh(); }}
      >
        <Bell size={20} strokeWidth={2.1} />
        {unread > 0 && (
          <span className="notif-badge-dot" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="notif-mark-all" onClick={markAll}>
                <CheckCheck size={14} /> Tout marquer lu
              </button>
            )}
          </div>
          <div className="notif-panel-list">
            {!loaded ? (
              <div className="notif-empty">Chargement…</div>
            ) : items.length === 0 ? (
              <div className="notif-empty">
                <Inbox size={22} />
                <span>Aucune notification pour l'instant</span>
              </div>
            ) : (
              items.map(n => (
                <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`}>
                  <div className="notif-item-icon">{ICONS[n.type] ?? <Bell size={16} />}</div>
                  <div className="notif-item-body">
                    <div className="notif-item-title">{n.title}</div>
                    {n.body && <div className="notif-item-text">{n.body}</div>}
                    <div className="notif-item-time">{timeAgo(n.created_at)}</div>
                  </div>
                  {!n.read && <span className="notif-unread-dot" aria-hidden />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
