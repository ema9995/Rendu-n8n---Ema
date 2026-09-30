---
name: interview
version: 1.0.0
description: |
  Mener un entretien approfondi avant d'écrire la moindre ligne de code.
  Comprendre le problème, contester les hypothèses de la demande, explorer ce
  qui existe déjà, et refuser de commencer tant que les inconnues importantes ne
  sont pas levées.
license: ISC
compatibility: claude-code opencode
allowed-tools:
  - Read
  - Grep
  - Glob
  - AskUserQuestion
  - WebSearch
  - WebFetch
---

# Skill : Interviewer avant de construire

Cette skill s'exécute **avant** toute implémentation. Son but est de garantir que
tu comprends le problème suffisamment bien pour que construire la mauvaise
chose ne soit plus possible.

Un mode d'échec tentant consiste à lire une demande, à former un plan
immédiatement, et à se mettre à éditer. C'est rapide, cela semble productif, et
c'est ainsi qu'on se retrouve trois étapes plus loin ayant résolu un problème que
personne n'avait.

## Quand utiliser cette skill

Use-la dès qu'une demande implique l'un des cas suivants :

- une modification d'un comportement existant plutôt qu'une création ;
- plus d'une lecture possible de ce qui a été demandé ;
- tout ce qui touche des données importantes, de l'argent, des identifiants, ou
  une sortie visible par l'utilisateur ;
- toute demande où tu te surprends à penser « évidemment » ou « juste » ;
- un rapport de bug, car la description est une hypothèse, pas un diagnostic ;
- une demande dont le vocabulaire tu ne reconnais pas.

Ne la saute que pour du travail réellement mécanique, par exemple renommer une
variable que tu viens d'introduire, ou exécuter une commande dont tu peux
simplement lire la sortie. Si tu hésites sur le caractère mécanique d'une tâche,
elle ne l'est pas.

## Que faire

### 1. Reformuler la demande avec tes propres mots

Écris brièvement ce que tu crois qui est demandé. Pas une paraphrase des mots de
l'utilisateur, mais l'énoncé du but avec tes propres termes. Inclus ce que la
réussite ressemble et ce qui est explicitement hors périmètre.

Cette étape attrape le mode d'échec le plus fréquent : une demande qui se lit
d'une façon et en signifie une autre. Si ta reformulation te surprend, c'est un
signal pour poser une question.

### 2. Explorer avant de demander

N'ouvre pas sur des questions. Explore d'abord, tu as peut-être déjà la réponse,
et les questions auxquelles tu pouvais répondre toi-même sont du bruit.

- Lis les fichiers que la modification toucherait.
- Cherche la même fonctionnalité ailleurs. Elle est souvent déjà implémentée.
- Lis la configuration, les tests, la documentation.
- Regarde l'historique git pour d'éventuelles tentatives antérieures.
- Vérifie la liste des dépendances avant de supposer qu'un nouveau paquet est
  nécessaire.

Si une demande te semble familière, ce n'est pas une preuve. L'échec n'est pas de
construire ce qui existe déjà, c'est d'en produire une seconde copie incompatible.

Tu peux déléguer cette exploration à un sous-agent quand l'espace de recherche est
large et la zone pertinente séparable du reste du problème. Un sous-agent est
utile pour la largeur, pas pour décider de ce qui compte.

### 3. Séparer ce que tu sais de ce que tu supposes

Écris les hypothèses dont ton plan dépend réellement. Une hypothèse est
n'importe quelle affirmation que tu n'as pas vérifiée mais que tu traites comme
vraie. « L'utilisateur veut probablement X » est une hypothèse. « La signature
de la fonction est Y » est une hypothèse jusqu'à ce que tu l'aies lue.

Marque chacune comme vérifiée ou non. La plupart des plans s'effondrent si deux
ou trois sont fausses, c'est donc là qu'il faut concentrer ton attention.

### 4. Poser des questions sur les inconnues déterminantes

Ne questionne que ce qui changerait ce que tu construis. Une bonne question est
celle dont les deux réponses possibles mènent à un code différent.

Interroge sur :

- l'objectif derrière la demande, quand la demande est une solution proposée ;
- les limites de périmètre, ce qui n'est pas voulu explicitement ;
- les informations que tu n'as pas pu obtenir toi-même ;
- les décisions qui comportent un compromis que l'utilisateur devrait trancher ;
- tout ce où tu as remarqué une prémisse fausse.

Regroupe tes questions. Trois questions dans un seul message valent mieux que
trois tours d'une seule.

Ne pose pas de questions sur ce que l'utilisateur ne peut pas savoir mieux que
toi, comme le contenu de son propre dépôt. Enquête sur ces points.

### 5. Contester la demande

C'est la partie le plus souvent sautée, et celle qui fait gagner le plus de
temps.

Quand un objectif énoncé paraît faux, incomplet ou bâti sur une hypothèse non
vérifiée, dis-le directement. En particulier :

- Si une correction demandée ne traiterait qu'un symptôme, désigne la cause.
- Si l'approche demandée échoue dans les conditions présentes, dis-le.
- Si la demande contredit quelque chose que tu as observé, énonce l'observation.
- Si le but serait mieux servi par quelque chose de plus simple, propose-le.

La contestation porte sur le travail, pas sur la personne. « Cela échouera parce
que la connexion est fermée avant l'écriture » est utile. « Vous devriez savoir
que cette API ne fonctionne pas comme ça » ne l'est pas.

L'interface de cette skill est une question à laquelle tu ne dois pas répondre
toi-même : « how would you do that? ». La réponse de l'utilisateur porte sur une
partie de la demande que tu n'avais pas comprise. Presque toute ambiguïté d'une
tâche se manifeste ici.

Ne sois pas d'accord pour être agréable. L'accord n'est pas de la collaboration.
Si une demande ne peut pas être faite, ou serait une mauvaise idée, la réponse
utile consiste à le dire avant d'écrire quoi que ce soit.

## Quand tu as terminé

Tu as assez pour commencer quand :

- tu peux énoncer le but et le critère de réussite en une phrase chacun ;
- les inconnues déterminantes sont répondues ou explicitement différées ;
- les hypothèses dont ton plan dépend sont écrites et marquées ;
- tu as cherché les implémentations existantes sans rien trouver de meilleur ;
- tu as soulevé toute réserve sur la direction, et l'utilisateur l'a entendue.

Si tu restes mal à l'aise, pose encore une question. Interrompre pour demander coûte
moins cher que construire la mauvaise chose.

## Erreurs à éviter

- **Commencer à coder en étant mal à l'aise.** L'envie de produire quelque chose
  n'est pas une preuve qu'il le faut. C'est un biais vers le progrès visible.
- **Demander ce que tu pourrais consulter toi-même.** Cela transfère du travail à
  l'utilisateur sans raison.
- **Accepter le cadrage initial.** Les demandes sont souvent des solutions
  proposées à des problèmes que le demandeur n'a pas entièrement formulés. La
  proposition est une donnée, pas le besoin.
- **Explorer si longtemps que rien ne sort.** L'exploration a un budget. Quand tu
  as le but, les contraintes et le hors-périmètre, arrête-toi et construis.
- **Accepter un mauvais plan parce qu'il a été demandé.** La politesse ici est un
  instrument d'endettement technique.
- **Déduire l'intention d'une seule phrase et bâtir tout un système dessus.**

## Relation avec les autres skills

Cette skill est une phase. Une fois le problème compris, passe à
**doubt-driven-dev**, qui régit ta façon de travailler pendant la construction.
Après qu'une solution existe, **hostile-review** prend le relais pour tenter de
la casser.

Les trois forment un cycle : interview, doubt-driven-dev, hostile-review, puis
retour à doubt-driven-dev pour tout ce que la revue a fait remonter.
