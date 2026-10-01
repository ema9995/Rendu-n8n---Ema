# Trajets du matin

Workflows n8n de récapitulatif de trajet, gérés comme du code avec [n8ncli](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

Chaque matin, un email résume l'état des transports sur le trajet domicile-travail
et la météo au départ, pour décider s'il faut partir plus tôt.

## Ce que fait le workflow

Du lundi au vendredi à 11h30 (9h30 UTC), le workflow interroge trois sources de
données publiques, les combine, et n'envoie un email que si quelque chose mérite
votre attention.

Il se déclenche si **au moins une** de ces conditions est vraie :

- une **perturbation annoncée** sur le RER B (incident, travaux), déclarée par
  l'exploiteur via l'API IDFM ;
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

## Structure

```
n8n/
  config/
    n8n-cli.json        config du dépôt, projet n8n cible
    n8n-standards.json  conventions de nommage et de style
    n8n-layout.json     règles de positionnement des nœuds
  workflows/
    Sandbox/
      Assistant de Trajet - Recapitulatif Matinal.workflow.ts
skills/
  interview/            phase d'interview avant développement
  doubt-driven-dev/     attitude de doute continue pendant le développement
  hostile-review/       revue adversariale après une première solution
```

Les workflows sont des fichiers TypeScript écrits avec le SDK officiel
`@n8n/workflow-sdk`, pas du JSON. Ils sont lisibles et versionnables, et
`n8ncli validate` les vérifie localement avant tout déploiement.

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

## Modifier le workflow

Les réglages du trajet sont dans le nœud `Parametres du Trajet` : gare, ligne,
destination, heure de départ, destinataire, coordonnées météo. La logique est
dans le nœud `Analyse Trajet`, qui lit les sources par leur nom avec
`$('Nom du nœud')` puis construit le HTML.

Modifier dans n8n puis faire `n8ncli pull` pour rapatrier les changements, ou
modifier ici puis `n8ncli push`. Attention, en mode MCP sans accès base de
données, `push` crée un nouveau workflow au lieu de mettre à jour l'existant, et
`pull` renomme le fichier d'après le nom affiché dans n8n.

## Licence

Usage personnel.
