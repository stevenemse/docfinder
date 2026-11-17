# Audit sécurité — RPC Supabase (DocFinder Cameroun)

Date : 16 novembre 2026 · Périmètre : toutes les fonctions `SECURITY DEFINER` des
migrations `supabase/*.sql` (75 occurrences, 57 fonctions distinctes).

## Méthode

1. Extraction automatique de chaque `CREATE OR REPLACE FUNCTION` et de son corps.
2. Recherche, dans le corps, d'une garde d'autorisation : `auth.uid()`,
   `current_profile_id()`, `is_moderator()`, `current_profile_role()`,
   `role = 'moderator'`, `role IN (…)`.
3. Vérification des `GRANT`/`REVOKE EXECUTE` (droits par défaut de PostgREST :
   toute fonction est appelable par `anon` et `authenticated` si rien n'est révoqué).
4. Lecture manuelle des fonctions signalées « sans garde » pour distinguer les
   vraies failles des fonctions de trigger ou de lecture publique.

## Résultats

### Critique

| Fonction | Fichier | Constat | Correctif |
|---|---|---|---|
| `admin_list_profiles()` | `migration-admin-dashboard.sql` | `SECURITY DEFINER` + `LANGUAGE sql` **sans aucun contrôle de rôle** : tout appelant (y compris `anon` via `/rest/v1/rpc/admin_list_profiles`) obtenait la liste complète des profils — nom, **téléphone**, **email**, statut, compteurs. Fuite de données personnelles à grande échelle. | Garde `is_moderator()` ajoutée + `REVOKE` anon/public, `GRANT` authenticated. |

### Élevé

| Fonction | Constat | Correctif |
|---|---|---|
| `get_partner_available_balance(uuid)` | Renvoie le solde disponible de **n'importe quel** partenaire à partir de son identifiant. | Remplacée côté client par `get_partner_balance_checked(uuid)` (propriétaire ou modérateur) ; exécution directe révoquée. |
| `find_lost_candidates(uuid)` / `find_matches_for_lost(uuid)` | Matching exécutable sur un dossier d'autrui (insertion de correspondances, énumération indirecte). | Wrappers `scan_matches_for_found` / `scan_matches_for_lost` qui vérifient `finder_id` / `seeker_id` (ou modérateur) ; exécution directe révoquée. Le client a été basculé sur les wrappers. |
| `expire_stale_handovers()` | Balayage d'expiration (relances, retours au trouveur, remboursements) déclenchable par n'importe quel client. | `admin_expire_stale_handovers()` (modérateur) pour l'UI ; original réservé à `service_role` (cron). |

### Faible / à corriger par principe

| Fonction | Constat | Correctif |
|---|---|---|
| `award_partner_earning()`, `notify_payment_paid()`, `notify_pickup_verified()`, `notify_partner_status_change()`, `notify_match_push()`, `set_updated_at()`, `sync_found_doc_pending_request()`, `create_escrow_on_payment()` | Fonctions de trigger inutilement exécutables par les rôles clients. | `REVOKE ALL … FROM anon, authenticated, public` (les triggers continuent de fonctionner). |
| `lookup_pickup`, `confirm_deposit`, `verify_pickup`, `register_partner` | Certaines migrations accordaient `EXECUTE` à `anon` (historique). | `REVOKE` anon/public + `GRANT` authenticated/service_role (défense en profondeur). |

### Vérifiées conformes (extrait)

`admin_dashboard_stats`, `admin_update_document`, `admin_delete_document`,
`admin_set_user_status`, `admin_list_all_documents`, `get_admin_partners`,
`get_admin_withdrawals`, `update_partner_status`, `mark_earning_paid`,
`process_wallet_withdrawal`, `request_wallet_withdrawal`,
`get_my_partner_wallet`, `get_partner_wallet`, `get_partner_earnings`,
`claim_with_lost_declaration`, `claim_match_by_doc`, `deposit_document`,
`confirm_deposit` (version `migration-partner-auth-required.sql`),
`verify_pickup` (idem), `lookup_pickup` (idem), `get_my_handovers`,
`get_my_pickup_info`, `get_unlocked_contacts`, `complete_recovery_after_payment`,
`get_my_notifications`, `mark_notifications_read`, `set_push_enabled`,
`ensure_profile`, `current_profile_id`, `current_profile_role`, `is_moderator`.

Fonctions de lecture publique assumées : `get_active_partners()`,
`found_doc_has_request(uuid)` (booléen sans donnée personnelle).

### Ordre des migrations

`lookup_pickup`, `confirm_deposit`, `verify_pickup` et `register_partner` ont
plusieurs définitions successives. La dernière en date
(`migration-partner-auth-required.sql`) est la version sécurisée
(authentification requise). La migration de durcissement révoque l'accès anonyme
pour que l'ordre d'application ne puisse plus rouvrir la faille.

## Application du correctif

```bash
# 1) Relecture du fichier, puis application sur la base de production
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migration-rpc-security-hardening.sql

# 2) Vérification : doit lever « Accès réservé aux modérateurs » avec un compte citoyen
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/admin_list_profiles" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CITIZEN_JWT" \
  -H "Content-Type: application/json" -d '{}'

# 3) Vérification en anonyme : doit répondre 401/403 (et non la liste des profils)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/rest/v1/rpc/admin_list_profiles" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{}'
```

## Application en production

Appliqué le **17/11/2026** sur le projet Supabase `Docfinder`
(`sbuqfmzraowfjoasrqrj`, eu-west-1), instruction par instruction, puis vérifié :

| Contrôle | Résultat |
|---|---|
| `SET ROLE anon; SELECT * FROM admin_list_profiles()` | `42501 permission denied for function admin_list_profiles` → PostgREST répond 401/403 |
| `SET ROLE authenticated; SELECT * FROM admin_list_profiles()` | `P0001 Accès réservé aux modérateurs` (garde active) |
| `SET ROLE authenticated; SELECT scan_matches_for_found('000…')` | `P0001 Authentification requise` (wrapper actif) |
| ACL `admin_list_profiles` | `{postgres, authenticated, service_role}` — `anon` retiré |
| ACL `find_lost_candidates`, `find_matches_for_lost`, `get_partner_available_balance`, `expire_stale_handovers` | `service_role` uniquement |
| ACL `award_partner_earning`, `notify_*`, `set_updated_at`, `sync_found_doc_pending_request`, `create_escrow_on_payment` | `service_role` uniquement |
| ACL `lookup_pickup`, `confirm_deposit`, `verify_pickup`, `register_partner` | `anon` retiré |

Avant correctif, `admin_list_profiles` portait `{=X/postgres, anon=X/postgres,
authenticated=X/postgres, …}` : la liste complète des profils (téléphone + email)
était donc bien accessible sans authentification.

## Reste à faire (hors périmètre RPC)

- Politique RLS du bucket `vault` (dossier `<profileId>/…` ou modérateur) à
  revérifier dans le dashboard Supabase.
- En-tête CSP en production.
- `payouts` vide en base : le trigger de séquestre ne crée aucune ligne, donc les
  montants « gains / en séquestre » du wallet citoyen restent à 0.
