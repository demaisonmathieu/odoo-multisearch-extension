# Fiche Chrome Web Store — Odoo Multi-Search

Ce fichier contient tout le texte prêt à copier-coller dans le tableau de bord développeur Chrome
Web Store (chrome.google.com/webstore/devconsole), plus les captures d'écran associées
(`screenshots/*.html`, à exporter en PNG — voir instructions en bas de ce fichier).

## Nom de l'extension

```
Odoo Multi-Search
```

## Résumé court (132 caractères max — affiché dans les résultats de recherche)

```
Recherche multi-modèles sur Odoo depuis une palette façon Ctrl+K, avec vos filtres et modèles favoris. Aucune donnée envoyée à un serveur tiers.
```

*(134 caractères — à raccourcir légèrement si le formulaire le refuse, par exemple en retirant
"Aucune donnée envoyée à un serveur tiers.")*

Version courte alternative (127 caractères) :
```
Recherche multi-modèles sur Odoo depuis une palette façon Ctrl+K, avec vos filtres et vos modèles favoris personnalisables.
```

## Catégorie suggérée

`Productivité` (Productivity)

## Description complète

```
🔍 Odoo Multi-Search — la recherche multi-modèles pour les consultants et utilisateurs Odoo

Vous travaillez sur plusieurs bases Odoo et vous perdez du temps à naviguer entre les menus pour
retrouver un contact, une facture ou une tâche ? Odoo Multi-Search ouvre une palette de recherche
centrée à l'écran (façon Ctrl+K), directement par-dessus votre instance Odoo, sans jamais quitter
votre session.

✨ FONCTIONNALITÉS

• Recherche instantanée sur plusieurs modèles à la fois (contacts, factures, commandes, tâches,
  tickets...) avec un seul terme.
• Ouverture en un clic vers la liste filtrée, la vue kanban, ou directement la fiche quand il n'y
  a qu'un seul résultat.
• Critères avancés : construisez un vrai domaine Odoo (champ / opérateur / valeur), y compris sur
  des champs relationnels comme partner_id.name — sans écrire une ligne de code.
• Recherche sans critère : listez tous les enregistrements d'un modèle en un clic.
• Aller à un menu : tapez "/" suivi d'un terme pour naviguer directement vers un menu Odoo,
  exactement comme le Ctrl+K natif d'Odoo.
• Modèles par défaut entièrement personnalisables : choisissez ce qui apparaît par défaut parmi
  tous les modèles réellement installés sur votre instance, avec une distinction claire entre
  "présent dans ma liste" et "coché par défaut à l'ouverture".
• Aucun identifiant à saisir : l'extension réutilise votre session Odoo déjà connectée dans
  l'onglet actif, exactement comme le fait Odoo Terminal.
• 100% local et respectueux de la vie privée : aucune donnée n'est envoyée à un serveur tiers,
  tout passe par l'API JavaScript de votre propre instance Odoo, dans votre navigateur.

⌨️ UTILISATION

1. Ouvrez un onglet sur votre instance Odoo, connecté.
2. Cliquez sur l'icône de l'extension, ou pressez Ctrl+Shift+K (Cmd+Shift+K sur Mac).
3. Tapez un terme et validez avec Entrée — ou laissez vide pour tout afficher.
4. Cliquez "Ouvrir" pour naviguer directement vers le résultat, dans la vue de votre choix
   (liste, kanban, ou fiche).

🔒 CONFIDENTIALITÉ

Odoo Multi-Search ne collecte, ne transmet et ne stocke aucune donnée personnelle sur un serveur
externe. Il ne s'exécute que dans l'onglet actif, au moment où vous cliquez sur l'icône ou
utilisez le raccourci clavier, et ne communique qu'avec l'instance Odoo déjà ouverte dans cet
onglet. Les seules données conservées (vos modèles par défaut et votre vue préférée) restent dans
le stockage synchronisé de votre propre compte Chrome.

Conçu par et pour des consultants et utilisateurs Odoo, pour retrouver n'importe quel
enregistrement en quelques secondes — quel que soit le modèle.
```

## Justification des permissions (pour le formulaire "Confidentialité" du Developer Dashboard)

| Permission | Justification |
|---|---|
| `activeTab` | Nécessaire pour n'agir que sur l'onglet actif, et uniquement lorsque l'utilisateur clique sur l'icône de l'extension ou utilise le raccourci clavier — pas d'accès permanent ni à d'autres onglets. |
| `scripting` | Permet d'injecter la palette de recherche dans l'onglet actif, et de dialoguer avec l'API JavaScript du client web Odoo déjà chargé (`env.services.orm`, `env.services.action`) pour exécuter les recherches et ouvrir les résultats — sans jamais faire de requête HTTP depuis l'extension elle-même. |
| `storage` | Stocke localement (`chrome.storage.sync`) uniquement les préférences de l'utilisateur : la liste des modèles par défaut et la vue préférée (liste/kanban). Aucune donnée métier, aucun contenu de recherche n'est stocké. |

Cette extension ne déclare aucun `host_permissions` : elle n'a accès à un site que pendant
l'interaction explicite de l'utilisateur (icône ou raccourci), jamais en arrière-plan.

## Icônes

Déjà présentes dans `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` (violet Odoo uni
— à remplacer par un vrai logo si besoin avant publication).

## Captures d'écran (screenshots)

Trois maquettes HTML fidèles à l'interface réelle sont dans `screenshots/` :

1. `screenshot-1-search.html` — recherche multi-modèles avec résultats et ouverture en kanban/fiche.
2. `screenshot-2-advanced.html` — éditeur de critères avancés (champ / opérateur / valeur).
3. `screenshot-3-models.html` — sélecteur de modèles par défaut (présent vs. coché par défaut).

Elles utilisent des données 100% fictives (aucune donnée client réelle) et reproduisent
exactement le CSS de l'extension (`overlay.js`), avec un faux fond d'écran Odoo générique pour le
contexte visuel.

**Pour les exporter en PNG** (taille déjà fixée à 1280×800, le format attendu par le Chrome Web
Store) :
1. Ouvrez le fichier `.html` dans Chrome (double-clic, ou glisser-déposer dans un onglet).
2. Ouvrez les DevTools (F12), puis `Ctrl+Shift+P` (`Cmd+Shift+P` sur Mac) → tapez
   "Capture full size screenshot" → Entrée.
3. Le PNG est téléchargé directement, prêt à uploader dans la fiche Chrome Web Store.
