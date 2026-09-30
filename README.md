# Trajets du matin

Workflows n8n de recapitulatif de trajet, geres comme du code avec [n8ncli](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli).

Le projet contient un seul workflow : un email quotidien qui resume l'etat du
RER B au depart de Mitry-Claye.

## Ce que fait le workflow

Chaque jour a 11h30 (9h30 UTC), du lundi au vendredi, il interroge deux sources
de donnees publiques, les combine, et n'envoie un email que si quelque chose
merite votre attention.

Il se declenche si **au moins une** de ces conditions est vraie :

- une **perturbation annoncee** sur le RER B (incident, travaux), declaree par
  l'exploiteur via l'API IDFM ;
- un **retard d'au moins 10 minutes** constate sur un train au depart.

Un simple retard de quelques minutes ne declenche rien, sinon le mail partirait
tous les jours. Si les deux sources echouent, aucun mail n'est envoye : c'est la
regle 7.3 du cahier des charges d'origine. La temperature n'est jamais une source
fiable a elle seule, elle est purely informative.

Le corps du mail est en HTML : un bandeau avec le statut, un resume, les
perturbations, et un tableau des retards colores selon le seuil.

## Sources de donnees

Toutes gratuites, aucune ne demande de compte.

| Source | Usage | Limite |
| --- | --- | --- |
| [API IDFM / Prim](https://prim.iledefrance-mobilites.fr/) `line_reports` | Perturbations annoncees sur la ligne | necessite une cle API personnelle |
| [SIRI Lite SNCF](https://proxy.transport.data.gouv.fr/resource/sncf-siri-lite-estimated-timetable) | Retards minute par minute | **ne couvre que les 60 prochaines minutes** |
| [Open-Meteo](https://api.open-meteo.com/) | Temperature au depart | aucune |

La cle API est stockee dans une credential n8n, pas dans le workflow.

### La limite du flux SIRI, a retenir

Le flux ne contient que les trains des 60 prochaines minutes. La nuit et en
dehors des heures de circulation il est vide ou ne contient que des bus de nuit.
Une execution a ces heures affiche « aucun train dans la fenetre temps reel » :
c'est normal, ce n'est pas une panne. Le flux pese plusieurs dizaines de Mo, d'ou
un timeout de 90 secondes sur le noeud HTTP.

Le nom de la gare est compare de facon tolerante, casse, espaces et tirets
ignores : `Mitry-Claye` et `Mitry - Claye` sont equivalents. C'est necessaire car
le flux utilise la forme avec espaces.

## Regles appliquees

- Perturbation = perturbation annoncee ou retard >= 10 min
- La temperature est affichee mais n influence jamais la recommandation
- La meteo seule ne vaut pas source fiable
- Depart recommande : 15 min d avance par perturbation annoncee, plus le
  depassement au-dela du seuil, plafonne a 45 min

Les deux dernieres regles sont un choix de conception, pas une transcription du
cahier des charges d'origine. Le seuil de 10 minutes est code en dur dans le
noeud `Analyse Trajet`, il n'est pas dans les variables du workflow.

## Structure

```
n8n/
  config/
    n8n-cli.json        config du depot, projet n8n cible
    n8n-standards.json  conventions de nommage et de style
    n8n-layout.json     regles de positionnement des noeuds
  workflows/
    Sandbox/
      Assistant de Trajet - Recapitulatif Matinal.workflow.ts
```

Les workflows sont des fichiers TypeScript ecrits avec le SDK officiel
`@n8n/workflow-sdk`, pas du JSON. Ils sont lisibles et versionnables, et
`n8ncli validate` les verifie localement avant tout deploiement.

## Configurer une nouvelle instance

```bash
npm install -g @workflows-accelerator/n8n-cli
n8ncli init --url https://votre-instance.n8n.cloud \
            --access-token <token-mcp> \
            --project-id <id-projet>
n8ncli pull
```

Le token est un token MCP de l'instance, pas une cle API REST. Il suffit pour
lire et ecrire les workflows.

## Attendu et modifie

```bash
n8ncli status              # ce qui differe de l'instance
n8ncli diff <fichier>      # detail des modifications
n8ncli validate --lint     # verification locale
n8ncli push                # deploie sur l'instance
```

## Modifier le workflow

Les reglages journeys sont dans le noeud `Parametres du Trajet` : gare, ligne,
destination, heure de depart, destinataire, coordonnees meteo. La logique est
dans le noeud `Analyse Trajet`, qui lit les deux sources par leur nom avec
`$('Nom du noeud')` puis construit le HTML.

Modifier dans n8n puis faire `n8ncli pull` pour rapatrier les changements, ou
modifier ici puis `n8ncli push`. Attention, dans le mode MCP sans acces base de
données, `push` cree un nouveau workflow au lieu de mettre a jour l'existant, et
`pull` renomme le fichier d'apres le nom affiche dans n8n.

## Licence

Usage personnel.
