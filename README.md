# Workflows n8n

Deux workflows n8n gérés comme du code avec [n8ncli](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

| Dossier | Workflow | Rôle |
| --- | --- | --- |
| `Assistant de Trajet/` | `Assistant de Trajet - Recapitulatif Matinal` | Chaque matin, un email dit s'il faut partir plus tôt pour le trajet domicile-gare |
| `bibliothèque de livres interrogeable par chat/` | `Chat livre` | Indexe des PDF dans Supabase et répond à des questions sur leur contenu |

Ils n'ont rien à voir entre eux : pas de déclencheur commun, pas de table
partagée, pas de credential commune. Ce sont deux projets qui cohabitent dans le
même dépôt.

---

# Assistant de Trajet

Chaque matin, un email résume l'état des transports sur le trajet domicile-travail
et la météo au départ, pour décider s'il faut partir plus tôt.

## Ce que fait le workflow

Du lundi au vendredi à 11h30 (9h30 UTC), le workflow interroge trois sources de
données publiques, les combine, et n'envoie un email que si quelque chose mérite
votre attention.

Il se déclenche si **au moins une** de ces conditions est vraie :

- une **perturbation annoncée** sur le RER B (incident, travaux), déclarée par
  l'exploitant via l'API IDFM ;
- un **retard d'au moins 10 minutes** constaté sur un train au départ.

Un simple retard de quelques minutes ne déclenche rien, sinon le mail partirait
tous les jours. Si aucune source de transport n'est exploitable, aucun mail n'est
envoyé : c'est la règle 7.3 du cahier des charges d'origine.

Le corps du mail est en HTML : un bandeau de statut, un résumé, les
perturbations, le tableau des retards, et la température.

## Les trois sources

| Source | Usage | Limite |
| --- | --- | --- |
| [API IDFM / Prim](https://prim.iledefrance-mobilites.fr/) `line_reports` | Perturbations annoncées sur la ligne | nécessite une clé API personnelle |
| [SIRI Lite SNCF](https://proxy.transport.data.gouv.fr/resource/sncf-siri-lite-estimated-timetable) | Retards minute par minute | **ne couvre que les 60 prochaines minutes** |
| [Open-Meteo](https://api.open-meteo.com/) | Température au départ | aucune |

La clé API est stockée dans une credential n8n, pas dans le workflow.

### Perturbations annoncées

L'API IDFM publie ce que l'exploitant déclare : incidents, travaux, ascenseurs en
panne. Le workflow filtre sur la ligne du RER B, sur les perturbations en cours,
c'est-à-dire dont la période d'application couvre aujourd'hui et qui ont le
statut `active`. Les perturbations futures, comme une desserte saisonnière, sont
exclues.

C'est une information confirmée, pas une prédiction. Quand elle est présente, le
mail part quelle que soit la durée du trajet.

### Retards des trains

Le flux SIRI Lite donne, pour chaque train et chaque gare, l'horaire prévu
(`AimedDepartureTime`) et l'horaire réel (`ExpectedDepartureTime`). Le retard est
la différence entre les deux, ce qui est l'équivalent de l'ancien
`departure_delay` de Navitia. Les trains sont triés du plus fort retard au plus
faible, et le mail colore chaque ligne selon le seuil de 10 minutes.

**La limite à retenir** : le flux ne contient que les trains des 60 prochaines
minutes. La nuit et hors heures de circulation, il est vide ou ne contient que
des bus de nuit. Une exécution à ces heures affiche « aucun train dans la fenêtre
temps réel » : c'est normal, ce n'est pas une panne. Le flux pèse plusieurs
dizaines de Mo, d'où un timeout de 90 secondes sur le nœud HTTP.

Le nom de la gare est comparé de façon tolérante, casse, espaces et tirets ignorés :
`Mitry-Claye` et `Mitry - Claye` sont équivalents. C'est nécessaire car le flux
utilise la forme avec espaces.

### Météo

La température vient d'Open-Meteo, sans clé et sans compte, lue au départ. Elle
est affichée dans le résumé du mail, en degrés Celsius.

Son rôle est strictement **informatif**. Elle n'entre pas dans le calcul de la
perturbation, elle ne modifie pas l'heure de départ recommandée, et elle ne
compte pas comme source fiable. La règle 3.4 du cahier des charges l'impose
explicitement : la température est une information de confort, pas un facteur de
risque de retard.

Concrètement, cela signifie deux choses. Un mail ne part jamais uniquement parce
qu'il fait froid, et un mail ne part pas non plus parce qu'il fait beau alors que
les trains sont à l'heure. La météo est là pour que la décision soit informée, pas
pour la déclencher.

C'est aussi pourquoi la ligne « Météo » du résumé affiche `Indisponible` plutôt
que de faire échouer le mail quand l'appel échoue : une météo manquante ne doit
pas empêcher un avertissement transport légitime.

Les coordonnées utilisées sont celles de la gare de départ, modifiables dans le
nœud `Parametres du Trajet` sous les noms `latitudeMeteo` et `longitudeMeteo`.

## Règles appliquées

- **Déclenchement** : perturbation annoncée OU retard ≥ 10 min
- **La température est affichée mais n'influence jamais la recommandation** (3.4)
- **La météo seule ne vaut pas source fiable**, il faut une source de transport
- **Départ recommandé** : 15 min d'avance par perturbation annoncée, plus le
  dépassement au-delà du seuil, plafonné à 45 min
- **Aucune source de transport disponible = aucun envoi** (7.3)

Le calcul du départ recommandé et le seuil de 10 minutes sont des choix de
conception, pas une transcription du cahier des charges d'origine. Le seuil est
codé en dur dans le nœud `Analyse Trajet`, il n'est pas dans les variables du
workflow.

---

# Chat livre

Une bibliothèque de livres interrogeable par chat. On dépose un PDF, il est
nettoyé, découpé **par chapitre**, vectorisé et rangé dans Supabase. Ensuite on
pose une question et Gemini répond en s'appuyant uniquement sur les extraits
trouvés.

## Les trois chemins

Le workflow contient trois chemins, avec trois points d'entrée distincts.

### 1. Indexation

`On form submission` → `Extract from File` → `Edit Fields` → `Clean` → `Chunking` → `Limit` → `Call 'RAG Livre 2 Chunking'`

Le formulaire demande un titre de livre et un PDF. `Extract from File` en sort le
texte, et son champ binaire est résolu dynamiquement, donc le nom du champ
n'a pas d'importance.

`Clean` normalise le texte : fins de ligne, caractères de contrôle, césures
hyphenées (`((\w)-\n(\w)` devient `$1$2`), puis suppression des numéros de page
isolés, des chiffres romains isolés, et des en-têtes courant, détectés comme des
lignes courtes répétées cinq fois ou plus.

`Chunking` fait le travail important : **un chunk par chapitre**. Un titre est
reconnu s'il tient sur une ligne de 80 caractères maximum, s'il suit le motif
`Chapter 3`, `Chapitre 3` ou `Part II`, ou s'il est entièrement en capitales. Sont
ignorés les figures, tableaux, images et sources, ainsi que les lignes écrites en
lettres espacées. Les sections de moins de 2 000 caractères sont fusionnées avec la
suivante, et l'appareil critique (notes, bibliographie, index, glossaire, annexes)
reste d'un seul bloc. Si aucune structure de chapitres n'est détectée, le nœud
replie sur un découpage par taille.

Chaque chunk sort avec son contenu et ses métadonnées : `chapter`, `chapterIndex`,
`part`, `method`, `keywords`, plus le titre du livre.

### 2. Sous-traitance de l'insertion

`Chunking Trigger` → `Embed Chunks` → `Merge Chunks with Vectors` → `Insert Chunks with SQL Query`

Ce chemin est déclenché par le dernier nœud du chemin 1, en mode `each` : un
appel par chunk. `Embed Chunks` appelle Gemini `batchEmbedContents` en 1536
dimensions. `Merge Chunks with Vectors` sérialise le vecteur et les métadonnées en
JSON, parce que le pilote Postgres transformerait un tableau JavaScript brut en
littéral de tableau et que le cast `::vector` le refuserait.

L'insertion se fait en SQL, un `insert` préparé par chunk. Les colonnes `keywords`
et `book` sont extraites du jsonb dans la même requête :

```sql
insert into documents_v2 (content, metadata, embedding, keywords, book)
values ($1, $2::jsonb, $3::vector,
        array(select jsonb_array_elements_text(coalesce($2::jsonb->'keywords', '[]'::jsonb))),
        nullif($2::jsonb->>'book', ''))
returning id;
```

### 3. Chat

`When chat message received` → `Load History` → `List Books` → `Extract Question Keywords` → `Parse Keywords` → `Embed Question` → `Route and Search` → `Build Context` → `Generate Answer` → `Format Reply` → `Save History` → `Send Reply`

`Load History` relit les huit derniers messages de la session, remit dans l'ordre.
`List Books` liste les livres indexés, du plus récent au plus ancien.

`Extract Question Keywords` est le nœud qui fait le travail de langage. Un appel
Gemini à température 0 transforme le dernier message en question autonome, choisit
le livre visé — celui que le message nomme, sinon le plus récent — et produit
jusqu'à dix mots-clés, chacun donné **en anglais et en français**, sans mot vide.
C'est ce qui permet de comprendre un « oui », « continue » ou « dis-moi en plus »
en s'appuyant sur l'historique.

`Route and Search` fait une recherche hybride, entièrement en SQL :

```sql
select id, content, metadata, book,
  1 - (embedding <=> $1::vector) as similarity,
  cardinality(array(select unnest(coalesce(keywords, '{}'))
                    intersect select jsonb_array_elements_text($2::jsonb))) as keyword_hits
from documents_v2
where book = $3
order by (embedding <=> $1::vector)
         - 0.05 * cardinality(array(select unnest(coalesce(keywords, '{}'))
                                     intersect select jsonb_array_elements_text($2::jsonb)))
limit 6;
```

La similarité vectorielle fait l'ordre, et chaque mot-clé partagé avec la question
bonifie le rang. Sans mot-clé, le bonus vaut zéro et la recherche est purement
vectorielle. Le filtre `where book = $3` garantit que la réponse ne mélange jamais
deux livres.

`Build Context` formate chaque extrait en
`[Extrait N | Livre : … | Chapitre : … | similarité …]`, puis `Generate Answer`
répond à 0.3 avec un prompt qui interdit d'inventer et de signaler les limites des
extraits. `Save History` enregistre le couple question-réponse pour le tour suivant.

## Modèle de données

Deux tables, sur la même base Supabase que le reste.

**`documents_v2`** — les chunks indexés

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | `bigserial` | identifiant du chunk |
| `content` | `text` | le texte du chapitre |
| `metadata` | `jsonb` | chapitre, partie, méthode de découpe, mots-clés, titre |
| `embedding` | `vector(1536)` | vecteur Gemini |
| `keywords` | `text[]` | recherche hybride |
| `book` | `text` | titre du livre |

**`chat_history`** — l'historique, avec `session_id`, `role`, `content` et
`created_at`.

## Points de vigilance

- **Le workflow s'appelle lui-même.** Le nœud `Call 'RAG Livre 2 Chunking'` pointe
  vers l'ID `Abd2yYNGh1GHfMIR`, qui est celui du workflow lui-même. Le chemin 2 est
  une entrée séparée, donc cela fonctionne, mais le nom affiché est périmé et la
  configuration est fragile.
- **La description du workflow est fausse** : elle parle encore de « chunking
  sub-workflow ». La note sticky `What this sub-workflow owns` décrit elle aussi
  une chaîne de cinq nœuds qui n'existe plus.
- **`Limit` vaut 5.** Avec un découpage par chapitre, un livre de quarante
  chapitres demande huit exécutions du formulaire.
- **`Edit Fields` est vide**, c'est un nœud sans effet.
- **Pas de déduplication.** Ré-uploader le même PDF stocke les chapitres une
  seconde fois, et la recherche renvoie alors chaque extrait en double.
- **`Embed Chunks` n'a pas de reprise automatique**, volontairement : une reprise
  rejouerait tous les chapitres depuis le début et brûlerait le quota quotidien.

---

## Structure

```
Assistant de Trajet/
  Assistant de Trajet - Recapitulatif Matinal.workflow.ts
bibliothèque de livres interrogeable par chat/
  Chat livre.workflow.ts
config/
  n8n-cli.json        config du projet n8n cible
  n8n-standards.json  conventions de nommage et de style
  n8n-layout.json     règles de positionnement des nœuds
skills/
  interview/            phase d'interview avant développement
  doubt-driven-dev/     attitude de doute continue pendant le développement
  hostile-review/       revue adversariale après une première solution
```

Un dossier par projet, un workflow par fichier. Les workflows sont écrits en
TypeScript avec le SDK officiel `@n8n/workflow-sdk`, pas en JSON : ils sont
lisibles et versionnables, et `n8ncli validate` les vérifie localement avant tout
déploiement.

Les trois skills décrivent des méthodes de travail pour une IA : comprendre avant
d'agir, vérifier pendant, et casser le résultat avant de le livrer.

## Configurer une nouvelle instance

```bash
npm install -g @workflows-accelerator/n8n-cli
n8ncli init --url https://votre-instance.n8n.cloud \
            --access-token <token-mcp> \
            --project-id <id-projet>
n8ncli pull
```

Le token est un token MCP de l'instance, pas une clé API REST. Il suffit pour
lire et écrire les workflows.

## Attendu et modifié

```bash
n8ncli status              # ce qui diffère de l'instance
n8ncli diff <fichier>      # détail des modifications
n8ncli validate --lint     # vérification locale
n8ncli push                # déploie sur l'instance
```

## Modifier un workflow

Pour `Assistant de Trajet`, les réglages du trajet sont dans le nœud
`Parametres du Trajet` : gare, ligne, destination, heure de départ,
destinataire, coordonnées météo. La logique est dans le nœud `Analyse Trajet`,
qui lit les sources par leur nom avec `$('Nom du nœud')` puis construit le HTML.

Pour `Chat livre`, les réglages sont dans le nœud `Chunking` pour la découpe, et
dans le prompt de `Extract Question Keywords` pour le choix du livre et la
reformulation.

Modifier dans n8n puis faire `n8ncli pull` pour rapatrier les changements, ou
modifier ici puis `n8ncli push`. Attention, en mode MCP sans accès base de
données, `push` crée un nouveau workflow au lieu de mettre à jour l'existant, et
`pull` renomme le fichier d'après le nom affiché dans n8n.

## Licence

Usage personnel.
