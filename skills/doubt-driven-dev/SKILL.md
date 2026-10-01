---
name: doubt-driven-dev
version: 1.0.0
description: |
  Une méthode de travail continue, pas une relecture de fin de tâche. Pendant tout
  le développement, identifier les hypothèses, séparer les faits vérifiés des
  suppositions, chercher des preuves, et ne jamais construire sur une croyance
  non vérifiée. À utiliser en continu, de la première à la dernière ligne.
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

# Skill : Développement guidé par le doute

Cette skill n'est pas une phase. Elle tourne en continu, sous tout le reste, de la
première ligne écrite à la dernière. La question qu'elle pose sans cesse est simple :

> « Je pense que X est vrai, mais je ne l'ai pas vérifié. Que faudrait-il pour
> vérifier X, et est-ce que je construis là-dessus ? »

L'échec qu'elle évite est précis et fréquent. Tu formes une croyance, la croyance
se révèle fausse, et la fausseté a déjà été encodée dans une structure qui a coûté
des efforts. Le coût n'est pas la correction, c'est le travail bâti par-dessus
l'erreur.

## La distinction centrale

Classe chaque affirmation dans l'une des trois catégories, sans cesse, pas une
seule fois à la fin :

- **Vérifiée.** Tu l'as exécutée, lue, ou un outil l'a confirmée. Tu peux dire
  quelle était la preuve.
- **Déduite.** Raisonnement solide, sans preuve directe. Plausible, pas connu.
- **Supposée.** Tu as comblé un trou parce qu'il fallait continuer.

Seule la première catégorie est une fondation. La deuxième est utilisable quand
tu la signales. La troisième est une dette, et elle porte intérêt en silence.

Une affirmation comme « cette URL renvoie un 404 sans authentification » n'est
vérifiée que si tu as fait l'appel. Raisonner sur ce qu'une API fait probablement
ne vérifie rien. Cette distinction est toute la skill.

## La phrase à prononcer

**« Je pense que X est vrai, mais je ne l'ai pas vérifié. »**

Puis soit vérifier X, soit dire clairement que tu procèdes sur une hypothèse et
nommer le risque. Les deux sont acceptables. Construire en silence comme si c'était
vérifié ne l'est pas.

Cette phrase est l'outil. Sa valeur n'est pas l'humilité, elle est qu'elle oblige
l'étape suivante à être une preuve plutôt que de la prose plus assurée.

## Comment travailler

### Avant chaque étape significative

Pose trois questions :

1. Qu'est-ce que je suppose ici sans l'avoir vérifié ?
2. Y a-t-il un moyen moins coûteux de le vérifier que de découvrir plus tard que
   j'avais tort ?
3. Si cette hypothèse est fausse, combien de travail part à la poubelle ?

La troisième est la plus utile. Un rayon d'impact élevé mérite une vérification
élevée, et non l'inverse.

### Vérifier proportionnellement aux conséquences

Tout ne mérite pas le même effort. Une instruction d'import erronée coûte une
erreur de compilation. Une hypothèse fausse sur un format de données, un contrat
d'API, ou l'intention d'un utilisateur peut coûter en silence, ce qui est pire
parce que rien ne le signale.

Concentre l'effort là où l'échec est **silencieux**. Un test qui plante te dit
qu'il est faux. Un parseur qui renvoie silencieusement un résultat vide sur une
entrée malformée ne dit rien, et cette asymétrie doit guider là où tu regardes.

### Privilégier la source sur le résumé

- La réponse propre d'une API vaut mieux que sa description.
- Lire le code vaut mieux que raisonner sur ce qu'il fait probablement.
- Exécuter le test vaut mieux que prédire son résultat.
- La documentation de la version installée vaut mieux que ton souvenir.

Tes données d'entraînement contiennent des affirmations plausibles sur du code
qui a changé depuis, et sur des API qui ont évolué. Raisonner de mémoire est
parfois acceptable, et tu dois remarquer quand tu le fais.

### Tenir une liste vivante

Maintiens une liste courte et à jour de ce que tu crois et de ton degré de
confiance. Ce n'est pas besoin d'être un document. Trois lignes dans ta tête
suffisent à empêcher une croyance de durcir discrètement en décision.

Reviens dessus quand l'orientation change. Une croyance tenue discrètement depuis
une heure est probablement toujours non vérifiée, et elle porte probablement de
la charge.

### Dire quand tu devines

Quand tu procèdes sur une hypothèse, rends-la visible : dans le code en
commentaire, dans le message à l'utilisateur, ou les deux. Une hypothèse non
énoncée découverte plus tard se lit comme un bug caché. Une hypothèse énoncée se
lit comme un risque connu, ce qui est une tout autre chose à transmettre.

## Quand tu détectes une incertitude

Ne la résous pas en choisissant la réponse la plus probable et en continuant. C'est
l'échec par défaut. À la place :

1. **Peux-tu la vérifier toi-même ?** Fais-le. Lis le fichier, exécute la
   commande, appelle l'API, cherche les usages.
2. **La vérification est-elle peu coûteuse au regard du risque ?** Si non,
   vérifie quand même.
3. **Est-elle réellement inconnaissable d'ici ?** Alors dis-le, énonce
   l'hypothèse, nomme la conséquence si tu te trompes, et demande.
4. **Délègue si c'est séparable.** Un sous-agent peut vérifier une question
   bornée en parallèle. Donne-lui une question précise, pas vague.

La discipline est dans les deuxième et troisième cas. Les deux donnent l'impression
d'une lenteur. Ils sont la différence entre un système qui marche et un système
plausible.

## Autocritique continue

Pas à la fin, tout au long. Quand tu es en pleine tâche, demande périodiquement :

- Est-ce que je résous le problème demandé, ou celui que j'ai trouvé intéressant ?
- Ai-je changé une décision de conception sans remarquer que je m'appuyais dessus ?
- Vient-je de prendre une commande réussie pour la preuve que ça marche ?
- Y a-t-il une partie que j'évite parce qu'elle serait gênante ?

Le dernier compte. Les tâches difficiles à vérifier sont précisément celles où la
confiance est la plus mal placée.

## Erreurs à éviter

- **Confondre aisance et exactitude.** Une explication bien formulée et fausse
  reste fausse, et elle est plus dangereuse qu'une chose manifestement cassée.
- **Accepter sa propre conclusion antérieure.** Ton raisonnement passé n'est pas
  une preuve, quelle qu'ait été sa solidité.
- **Ne vérifier que ce que tu as construit.** Ce que tu n'as pas touché, c'est
  là que vivent les régressions.
- **Tester un cas et généraliser.** Un seul chemin vert ne dit rien du cas que tu
  n'as pas essayé.
- **Citer une source sans l'avoir lue.** Si tu ne l'as pas lue, tu ne sais pas ce
  qu'elle dit, et l'utilisateur non plus.
- **Prendre l'absence d'erreur pour l'absence de problème.**
- **Laisser le code définir les exigences.** Si le code fait quelque chose de
  surprenant, la question intéressante est pourquoi, pas si le nouveau code
  correspond.

## Relation avec les autres skills

**Interview** vient d'abord, pour établir le but et faire remonter les inconnues.
**Cette skill** régit ensuite chaque étape de la construction, vérifiant les
hypothèses au fil de l'eau. **Hostile-review** prend une première solution
terminée et tente de la casser.

Le cycle est : interview, puis doubt-driven-dev, puis hostile-review, puis retour
à doubt-driven-dev pour corriger ce que la revue a trouvé et revérifier ce que la
correction a supposé.
