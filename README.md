# Odoo Multi-Search

Extension Chrome (Manifest V3) pour rechercher un terme sur plusieurs modèles Odoo à la fois,
via une palette centrée à l'écran façon Ctrl+K, en réutilisant la session déjà connectée dans
l'onglet actif (comme le fait l'extension Odoo Terminal) — aucune credential à saisir.

## Comment ça marche

- **Ouverture** : clic sur l'icône de l'extension, ou raccourci clavier `Ctrl+Shift+K`
  (`Cmd+Shift+K` sur Mac, personnalisable dans `chrome://extensions/shortcuts`). Un second
  déclenchement referme la palette. `Échap` ou un clic hors de la fenêtre ferme aussi.
- **Overlay** (`overlay.js`) : injecté à la demande dans le contexte isolé de l'onglet actif,
  construit dans un Shadow DOM (pas de collision CSS avec la page hôte) et centré en haut de
  l'écran, comme un command palette.
- **Accès à Odoo** (`bridge.js`) : injecté dans le contexte JS de la page (MAIN world), il
  s'accroche à `odoo.__WOWL_DEBUG__.root.env` — le point d'entrée exposé par le webclient Odoo
  (OWL) dès qu'il est monté, même hors mode debug. La recherche appelle
  `env.services.orm.searchCount(model, domain)` (domaine `OR` sur `display_name ilike` par
  terme), et "Ouvrir" appelle `env.services.action.doAction(...)` pour naviguer directement vers
  la liste filtrée dans l'onglet, comme un clic de menu Odoo.
- **Orchestration** (`background.js`) : sert d'intermédiaire entre l'overlay (contexte isolé) et
  le bridge (MAIN world) via `chrome.runtime.sendMessage`, et garde la liste des modèles par
  défaut dans `chrome.storage.sync`.

Aucune requête HTTP n'est faite depuis l'extension elle-même : tout passe par le JS de la page,
donc aucun souci de CORS et aucune credential stockée.

## Installation

Cette extension n'est pas publiée sur le Chrome Web Store (voir `store/STORE_LISTING.md` si vous
voulez la publier vous-même) — elle s'installe en local, en mode développeur, depuis les sources.

### 1. Récupérer les sources

```sh
git clone https://github.com/demaisonmathieu/odoo-multisearch-extension.git
```

Ou, si vous n'avez pas encore Git configuré : téléchargez le ZIP depuis la page GitHub du dépôt
(bouton vert "Code" → "Download ZIP") puis décompressez-le.

### 2. Charger l'extension dans Chrome

1. Ouvrez `chrome://extensions` dans la barre d'adresse.
2. Activez le bouton **"Mode développeur"** en haut à droite de la page.
3. Cliquez sur **"Charger l'extension non empaquetée"** (en haut à gauche).
4. Sélectionnez le dossier `odoo-multisearch-extension` que vous venez de cloner/décompresser
   (celui qui contient `manifest.json`).
5. L'icône de l'extension apparaît dans la barre d'outils Chrome (épinglez-la via l'icône puzzle
   🧩 pour la garder visible).

### 3. Mettre à jour l'extension

Comme elle n'est pas installée depuis le Store, les mises à jour ne sont pas automatiques :

```sh
cd odoo-multisearch-extension
git pull
```

Puis retournez sur `chrome://extensions` et cliquez sur l'icône de rechargement (↻) de la carte
de l'extension pour qu'elle reprenne les nouveaux fichiers.

## Utilisation

1. Ouvrir un onglet sur une instance Odoo, être connecté.
2. Cliquer sur l'icône de l'extension (ou `Ctrl+Shift+K`).
3. Saisir un ou plusieurs termes puis `Entrée` (virgule = recherche OR), ou laisser le champ vide
   et appuyer sur `Entrée` pour afficher **tous** les enregistrements des modèles sélectionnés
   (aucun critère = domaine vide, pas une erreur).
4. Les pastilles de modèles affichées sont les modèles par défaut ; cliquer dessus pour en
   désélectionner/resélectionner ponctuellement avant de lancer la recherche.
5. Un nombre de résultats par modèle s'affiche ; "Ouvrir" navigue directement vers la liste
   filtrée dans l'onglet actif.

### Critères avancés (domaine)

L'icône 🔧 à côté de la barre de recherche ouvre un éditeur de critères, une ligne par critère,
chacune avec **3 champs séparés** : champ (texte libre, ex. `partner_id.name` — les chemins
pointés vers un champ relationnel sont transmis tels quels, Odoo résout la traversée côté
serveur), opérateur (`=`, `!=`, `>`, `>=`, `<`, `<=`, `like`, `ilike`, `not like`, `not ilike`, en
liste déroulante) et valeur (texte libre). "+ Ajouter un critère" ajoute une ligne, `×` la
supprime.

Un sélecteur **ET / OU** (à côté de "+ Ajouter un critère") définit comment les lignes se
combinent *entre elles* : toutes doivent correspondre (ET) ou au moins une (OU). Ce choix
s'applique globalement à toutes les lignes du domaine avancé (pas de groupes mixtes ET/OU
imbriqués) — pour des combinaisons plus complexes, mieux vaut composer plusieurs recherches
successives. Le domaine avancé ainsi obtenu reste toujours combiné en **ET** avec le terme de
recherche simple de la barre du haut, s'il est aussi renseigné (qui reste en OR entre ses propres
valeurs séparées par virgule).

Les valeurs numériques et `true`/`false` sont castées automatiquement, tout le reste est traité
comme chaîne brute (les guillemets restent acceptés mais ne sont plus nécessaires puisque le
champ valeur est déjà séparé de l'opérateur).

`Ctrl+Entrée` (ou `Cmd+Entrée` sur Mac) dans un champ/valeur lance la recherche, ou le bouton
"Rechercher" sous les critères — utile quand le terme de recherche du haut est vide et que seuls
des critères avancés sont renseignés (la recherche fonctionne alors uniquement sur ce domaine).

### Vue d'ouverture : liste, kanban ou formulaire

Un sélecteur "☰ Liste / ▦ Kanban" dans la barre de recherche définit la vue utilisée quand
"Ouvrir" est cliqué sur un résultat **multi-enregistrements** (persisté dans
`chrome.storage.sync`, comme les modèles par défaut). Quand un modèle ne remonte
**qu'un seul résultat**, le bouton devient "Ouvrir la fiche" et ouvre directement la vue
formulaire de cet enregistrement (Odoo génère toujours une vue kanban/liste/formulaire par
défaut même sans vue personnalisée, donc les deux options du sélecteur fonctionnent sur
n'importe quel modèle).

### Choisir les modèles de recherche par défaut

Cliquer sur l'icône ⚙ à côté de la barre de recherche ouvre le sélecteur de modèles : il
interroge `ir.model` sur l'instance Odoo active pour lister tous les modèles réellement
installés (nom + technique). Sans filtre, seuls les modèles **les plus courants** sont affichés
(`res.partner`, `account.move`, `sale.order`, `crm.lead`, `project.task`, etc. — voir
`COMMON_MODELS` dans `overlay.js`) pour ne pas noyer la liste sous ~500 modèles techniques ; taper
dans le champ de filtre cherche parmi **tous** les modèles installés.

Chaque ligne a **deux cases distinctes** :
- la case principale = le modèle est **présent** dans votre liste (il apparaît comme pastille
  dans la barre de recherche, cliquable pour l'inclure/exclure ponctuellement d'une recherche) ;
- "coché par défaut" (désactivée si la case principale ne l'est pas) = ce modèle démarre déjà
  sélectionné à l'ouverture de la palette, sans avoir à cliquer dessus. Un modèle peut donc être
  présent (visible comme option) sans être coché par défaut.

"Enregistrer par défaut" persiste cette configuration dans `chrome.storage.sync` (partagée entre
les onglets/postes synchronisés par le même compte Chrome). "Réinitialiser" revient à la liste
par défaut codée en dur (`res.partner`, `sale.order`, `purchase.order`, `account.move`,
`project.task`, `crm.lead`), tous cochés par défaut.

## Limites connues

- La recherche fait un `ilike` sur `display_name` uniquement — pas de champs personnalisés par
  modèle (email, référence, etc.) pour rester générique quel que soit le modèle.
- "Ouvrir" navigue dans l'onglet actif (remplace l'écran courant) plutôt que d'ouvrir un nouvel
  onglet ; un lien Odoo statique (`/odoo/<model>?domain=...`) ne rouvre pas fiablement une liste
  filtrée sans passer par une action existante (vérifié dans les sources du client web v19 :
  `router.js` / `action_service.js`), d'où le passage par `doAction()`.
- Icônes (`icons/*.png`) sont des placeholders unis — à remplacer si besoin.
