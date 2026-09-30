---
name: hostile-review
version: 1.0.0
description: |
  Revoir son propre travail de façon adversariale avant de le livrer. Présumer que
  la solution est fausse jusqu'à preuve du contraire, chercher activement bugs,
  cas limites et exigences manquées, vérifier les affirmations en exécutant de
  vraies commandes, puis corriger ce qui est trouvé. À utiliser après une première
  solution.
license: ISC
compatibility: claude-code opencode
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Edit
  - Bash
  - WebSearch
  - WebFetch
  - AskUserQuestion
---

# Skill : Revue hostile

Cette skill s'exécute **après** qu'une solution a été produite. Ton rôle est
désormais de traiter ton propre travail comme suspect.

L'état par défaut après avoir construit quelque chose est un sentiment
d'achèvement. Ce sentiment ne prouve rien. C'est ce que tu ressens après avoir
écrit du code qui compile, pas après avoir écrit du code correct. Cette skill
existe pour remplacer ce sentiment par des preuves réelles.

## La posture

Une seule question dirige toute la revue :

> **« Qu'est-ce qui pourrait être faux dans ce que je viens de faire ? »**

Pas « est-ce bon » ni « est-ce suffisant pour la demande ». Ces formulations
t'invitent à noter ton travail. Celle-ci présume qu'il y a un défaut et te demande
de le trouver. La plupart du temps il y en a un. Parfois celui que tu trouves est
un vrai problème que tu aurais livré.

Un cadrage utile : si un inconnu soumettait cette solution et que tu la
révisais avant déploiement, que vérifierais-tu ? Fais cela.

## Attaquer, par ordre de rendement

### 1. Les exigences, pas le code

Relis la demande initiale mot pour mot, puis ton travail, et confronte-les point
par point.

Le vrai défaut le plus fréquent d'une première solution n'est pas un bug. C'est un
**écart silencieux avec la demande**, où tu as construit quelque chose de voisin
de ce qui était demandé sans le remarquer. Construis la checklist à partir de ses
mots, pas de ton intention, car ton intention est précisément ce que tu essaies de
confirmer.

Cherche en particulier :

- une exigence satisfaite en lettre mais pas en substance ;
- une contrainte écartée en silence parce que gênante ;
- un périmètre étendu ou réduit, sans que tu le signales ;
- une hypothèse posée et jamais validée par l'utilisateur.

### 2. Les affirmations faites mais non vérifiées

Reprends tout ce que tu as affirmé et vérifie lesquelles tu as réellement
testées. Les phrases dangereuses sont les plus assurées : « ça fonctionne », « ça
gère le cas vide », « c'est rétrocompatible ».

Pour chacune, vérifie-la maintenant, ou ramène-la à ce que tu sais réellement. Une
revue qui laisse une affirmation non vérifiée énoncée comme un fait a aggravé la
situation au lieu de l'améliorer.

### 3. Cas limites et frontières

Pour chaque entrée, chaque branche, chaque appel externe :

- Que se passe-t-il sur vide, null, undefined, zéro, négatif ?
- Et si la liste a un élément, ou est énorme ?
- Et si l'appel externe est lent, expire, renvoie des données malformées, ou
  renvoie 200 avec un corps d'erreur ?
- Et si deux choses s'exécutent en même temps et touchent le même état ?
- Et si ceci s'exécute deux fois ? Est-ce idempotent ?
- Premier élément, dernier élément, valeurs de frontière, la valeur juste après
  un seuil.
- Unicode, accents, chaînes très longues, caractères spéciaux.
- Que se passe-t-il si l'utilisateur ferme l'onglet, ou si le processus meurt à
  mi-parcours ?

Écris cette liste et teste-la vraiment. Un test qui plante est un bug qui s'est
trouvé tout seul.

### 4. Logique et raisonnement

Redérive la logique importante à la main, indépendamment de la façon dont tu l'as
écrite. Si tu relis ton propre code en hochant la tête, tu en hérites l'erreur,
puisque tu l'as écrit pour la même raison que tu y crois.

Vérifie spécifiquement :

- Les décalages d'un cran à chaque frontière.
- Les conditions inversées. Une branche qui ne s'exécute jamais signale
  généralement une erreur de logique.
- Les conditions impossibles à vrai, ou toujours vraies. Cherche-les directement.
- Arithmétique, conversions d'unités, et arrondis à chaque étape.
- Dépendances à l'ordre qui ne sont pas imposées.
- Chemins d'erreur. Le cas d'échec fait-il vraiment la bonne chose, ou se
  contente-t-il d'éviter de planter ?

### 5. Effets de bord et régressions

- Qui d'autre utilise ce que tu as changé ? Cherche les appelants avant de
  modifier une signature ou un type de retour.
- Qu'as-tu changé que rien ne teste ?
- As-tu touché un fichier partagé dont tu n'as pas vérifié les autres usages ?
- Quelle config, quel cache, quel fichier généré est maintenant périmé ?
- Que dépend encore de l'ancien comportement ?

### 6. Tes choix techniques

Justifie les décisions à nouveau, maintenant que tu as l'implémentation. Les
alternatives qui méritent d'être réexaminées : le dépôt a-t-il déjà un utilitaire
pour cela ? Y a-t-il un appel de bibliothèque standard que tu as réécrit à la
main ? L'abstraction justifie-t-elle sa complexité ? Existe-t-il une version plus
simple qui répond au besoin réel ?

## Comment tester

Exécuter bat raisonner.

- Lance les tests, et lis les échecs que tu comptais ignorer.
- Écris un test pour le cas qui t'incertainait. C'est précisément parce que tu
  étais incertain qu'il faut l'écrire.
- Cherche à construire une entrée qui produit une mauvaise réponse. Si tu n'en
  trouves pas, ce n'est pas que le code est sûr, c'est que tu n'as pas assez
  cherché.
- Vérifie les frontières de chaque intervalle écrit.
- Exécute réellement la chose quand c'est possible. Une commande que tu n'as pas
  lancée est une hypothèse.

## Quand tu trouves des problèmes

Corrige-les. Puis réexamine la correction, parce qu'une correction introduit du
nouveau code et de nouvelles hypothèses. Un patch qui élargit le périmètre en
silence est un second défaut.

Dis clairement ce que tu as trouvé et ce que tu as changé. Ne corrige pas en
silence et ne présente pas le résultat comme s'il avait été juste du premier coup.
L'utilisateur a besoin de savoir quelles parties sont solides et lesquelles
étaient fausses, car c'est ce qui détermine combien il faut faire confiance au
résultat.

Si tu trouves un problème que tu ne peux pas corriger, dis-le. Un problème
incorrectable que l'utilisateur connaît vaut bien mieux qu'une livraison
d'apparence propre qui en cache un.

## Erreurs à éviter

- **Relire pour confirmer plutôt que pour trouver.** Relire son propre travail en
  cherchant une permission est la façon la plus courante que cette skill devienne
  du théâtre.
- **S'arrêter à la première passe.** La deuxième passe trouve ce que la première
  n'a pas trouvé, parce que la première confirme encore.
- **Ne tester que le chemin heureux.** C'est le chemin en lequel tu crois déjà.
- **Prendre un test qui passe pour une preuve.** Un test prouve un cas, et
  généralement celui auquel tu as pensé en l'écrivant.
- **Réécrire au lieu de vérifier.** Une réécriture complète en réponse à une revue
  est elle-même une erreur.
- **Déclarer victoire parce que l'effort a été long.** L'effort fourni n'est pas
  la qualité obtenue.
- **Sauter la revue parce que le changement était petit.** Les petits changements
  cassent de grandes choses, et la revue est moins chère quand le diff est petit.

## Relation avec les autres skills

**Interview** a établi le but. **Doubt-driven-dev** a gouverné la construction.
Cette skill attaque le résultat, ce qui est une posture différente et produit des
résultats différents : doubt-driven-dev intercepte de mauvaises croyances pendant
qu'elles sont encore bon marché, hostile-review constate les conséquences de celles
qui ont survécu.

Puis retourne à **doubt-driven-dev** pour vérifier chaque correction, car une
correction est du nouveau code portant de nouvelles hypothèses, et celles-ci
demandent à être vérifiées aussi.
