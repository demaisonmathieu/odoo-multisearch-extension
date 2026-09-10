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
  s'accroche à l'`env` OWL du webclient dès qu'il est monté. Pour rester compatible avec
  **n'importe quelle version d'Odoo** (testé conceptuellement de la v16 à la v19), deux méthodes
  sont tentées dans l'ordre : `odoo.__WOWL_DEBUG__.root.env` (hook spécifique à Odoo, présent
  depuis la v17) puis, en repli, `window.__OWL_DEVTOOLS__.apps` (hook générique du framework OWL
  lui-même, présent identiquement dans toutes les versions d'OWL 2.x, y compris la v16 où le hook
  Odoo n'existe pas encore). La recherche appelle `env.services.orm.searchCount(model, domain)`
  (domaine `OR` sur `display_name ilike` par terme), et "Ouvrir" appelle
  `env.services.action.doAction(...)` pour naviguer directement vers la liste filtrée dans
  l'onglet, comme un clic de menu Odoo. Le `name_search` utilisé pour l'autocomplétion des
  valeurs tente aussi automatiquement les deux signatures possibles (`domain` en v19+, `args`
  avant), sans dépendre d'une détection de version.
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

### Aller à un menu (comme le Ctrl+K natif d'Odoo)

Tapez `/` suivi d'un terme dans la barre de recherche (ex. `/facture`) puis `Entrée` : la palette
bascule en recherche de menu au lieu de rechercher des enregistrements, exactement comme le fait
le Ctrl+K natif d'Odoo avec son préfixe `/`. Les résultats affichent le chemin complet du menu
(ex. `Facturation / Factures clients`), et "Aller à →" y navigue directement via
`env.services.menu.selectMenu(...)` — le même service que celui utilisé quand on clique un menu
dans l'interface standard.

### Recherche ou ouverture sur un seul modèle : `/alias/valeur`

Un chemin à exactement 2 segments se comporte différemment selon ce que contient le second :

- **Nombre** (ex. `/projet/42`) → ouvre directement la fiche de cet enregistrement, sans passer
  par une recherche — pratique pour aller droit à un ID connu (vu dans une URL, un export, un
  log...).
- **Texte** (ex. `/projet/nomprojet`) → recherche `ilike` sur `display_name`, comme la barre de
  recherche normale, mais restreinte à ce seul modèle (résolu comme partout ailleurs : alias
  d'abord, puis nom affiché) — utile pour cibler un modèle précis sans avoir à le cocher/décocher
  parmi les pastilles.

### Recherche liée : `/modèle/terme/modèle-lié`

Tapez un chemin à **au moins 3 segments** séparés par `/` (ex. `/projets/sprinter/taches`) puis
`Entrée` : la palette affiche **une ligne par enregistrement du premier modèle** qui correspond au
terme, avec le nombre d'enregistrements du troisième modèle qui lui sont liés.

Exemple : `/projets/sprinter/taches` cherche les `project.project` dont le nom contient
"sprinter", puis pour chacun affiche le nombre de `project.task` liées (via le champ
`project_id`), avec un bouton "Ouvrir" par ligne pour accéder directement aux tâches de ce
projet précis.

- Les noms de modèles (`projets`, `taches`...) sont résolus **dynamiquement** contre le nom
  affiché de chaque modèle dans Odoo (`ir.model`), pas via un dictionnaire français codé en dur
  — ça fonctionne donc quelle que soit la langue configurée sur l'instance. Le nom technique
  exact (ex. `project.project`) fonctionne aussi directement.
- Le lien entre les deux modèles est déduit automatiquement : le premier champ many2one du
  troisième modèle qui pointe vers le premier modèle (limité à un lien direct, pas de chemin à
  plusieurs sauts).
- Seuls 3 segments sont supportés pour l'instant (un seul niveau de relation) ; un chemin plus
  long renvoie une erreur explicite plutôt qu'un résultat silencieusement tronqué.

**Autocomplétion pendant la frappe** : en tapant le 1ᵉʳ segment (après le `/`), une liste propose
vos alias personnalisés (voir ci-dessous) et les modèles dont le nom affiché correspond. En tapant
le 3ᵉ segment (après le 2ᵉ `/`), une liste propose les modèles qui ont effectivement un lien
many2one vers le modèle résolu au 1ᵉʳ segment (ex. après `/projets/sprinter/`, elle propose
`tâche`, `ticket d'assistance`... si ces modèles ont bien un champ pointant vers `project.project`
— cette recherche de candidats est limitée aux modèles courants et à vos alias, pas à
l'intégralité des modèles installés, pour rester rapide).

**Alias personnalisés** : dans le sélecteur de modèles (⚙), une section "Alias de modèles" permet
de définir des raccourcis (ex. `projet` → `project.project`) utilisés en priorité sur la
résolution automatique par nom affiché — utile pour un raccourci plus court, ou pour lever une
ambiguïté entre plusieurs modèles au nom proche. Stockés dans `chrome.storage.sync`, donc partagés
comme le reste de la configuration.

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

**Autocomplétion des champs** : quand **un seul modèle** est sélectionné (les champs diffèrent
d'un modèle à l'autre, donc pas d'autocomplétion possible avec plusieurs modèles à la fois), taper
dans le champ "champ" propose la liste des champs du modèle via la liste déroulante native du
navigateur — y compris les champs relationnels : taper `partner_id.` propose les champs de
`res.partner`, `partner_id.category_id.` ceux de la catégorie, etc. (un niveau de relation résolu
par point tapé). Chaque modèle interrogé (`fields_get`) est mis en cache dans la page tant que
l'onglet Odoo n'est pas rechargé, pour ne pas déclencher une requête à chaque frappe.

**Autocomplétion des valeurs** : une fois un champ saisi (toujours réservé au cas "un seul modèle
sélectionné"), le champ "valeur" propose aussi des suggestions selon le type du champ :
- champ à sélection (`selection`) → ses options possibles (`clé — libellé`) ;
- champ booléen → `true` / `false` ;
- champ relationnel (many2one...) → de vrais enregistrements existants (via `name_search`,
  filtré par ce que vous tapez), mis en cache par (modèle lié, terme tapé) pour éviter de
  requêter la base à chaque nouvelle frappe d'un terme déjà vu.

Un champ texte libre (char, integer, date...) n'a pas d'ensemble de valeurs prédéfini : aucune
suggestion n'est proposée dans ce cas, il faut taper la valeur directement.

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
