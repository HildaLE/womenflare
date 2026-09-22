PRAGMA foreign_keys = ON;

CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 10 AND 500),
  options TEXT NOT NULL CHECK (json_valid(options) AND json_array_length(options) = 4),
  answer_index INTEGER NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
  explanation TEXT NOT NULL,
  category TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX questions_position_idx ON questions(position, id);

CREATE TABLE resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT NOT NULL,
  phone TEXT,
  resource_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO questions (prompt, options, answer_index, explanation, category, position) VALUES
(
  'Lors d’une présentation sur une experte, un collègue commente d’abord son apparence avant d’évoquer son travail. Quelle réaction recentre le mieux l’échange ?',
  '["Ajouter un autre compliment sur son style", "Rappeler ses résultats et demander que l’évaluation porte sur ses compétences", "Ignorer systématiquement tout commentaire", "Changer de sujet sans rien dire"]',
  1,
  'Recentrer explicitement sur les compétences évite de réduire une professionnelle à son apparence sans supposer l’intention de la personne qui a parlé.',
  'Objectification et réduction au corps',
  1
),
(
  'Une campagne interne illustre les métiers techniques avec des hommes en action et des femmes surtout décoratives. Quel diagnostic est le plus précis ?',
  '["Un simple choix de couleurs", "Une réduction symbolique des femmes à leur image plutôt qu’à leur expertise", "Une obligation juridique automatique", "Une différence sans effet possible"]',
  1,
  'La composition peut installer une association entre action, compétence et masculin, tout en cantonnant les femmes à une fonction d’image. Le constat porte sur la représentation, pas sur une intention prêtée aux créateurs.',
  'Objectification et réduction au corps',
  2
),
(
  'Dans une équipe, la même collègue prend toujours les notes, réserve les salles et organise les départs, sans que cela figure dans ses objectifs. Que faire en priorité ?',
  '["La remercier et conserver cette organisation efficace", "Rendre ces tâches visibles puis les répartir à tour de rôle", "Lui proposer une formation à l’organisation", "Supprimer toutes les réunions"]',
  1,
  'Identifier, comptabiliser et répartir ces tâches empêche qu’un travail utile mais peu valorisé repose durablement sur une seule personne.',
  'Travail domestique invisible au bureau',
  3
),
(
  'Un manager demande spontanément à une salariée, plutôt qu’à ses collègues, d’accueillir les nouveaux et de commander le déjeuner. Pourquoi cette habitude mérite-t-elle d’être examinée ?',
  '["Parce que l’accueil ne sert jamais à l’équipe", "Parce que les tâches de service peuvent être assignées selon des attentes genrées et détourner du travail reconnu", "Parce qu’un manager ne peut déléguer aucune tâche", "Parce que commander un repas exige une certification"]',
  1,
  'Les tâches relationnelles sont nécessaires, mais leur attribution répétée et non reconnue peut créer une charge et réduire l’accès aux missions valorisées.',
  'Travail domestique invisible au bureau',
  4
),
(
  'Au moment d’attribuer un projet avec déplacements, l’équipe écarte une mère sans lui demander son avis, en supposant qu’elle préférera rester près de chez elle. Quelle pratique est plus équitable ?',
  '["Décider à sa place pour lui éviter une contrainte", "Présenter les exigences à toutes les personnes qualifiées et recueillir leurs préférences", "Réserver tous les déplacements aux personnes sans enfant", "Annuler le projet"]',
  1,
  'Une contrainte réelle peut être discutée, mais présumer une indisponibilité à partir de la situation familiale prive la personne de choix et d’opportunités.',
  'Biais liés à la vie privée et familiale',
  5
),
(
  'En entretien, une candidate est interrogée sur ses projets familiaux alors que les autres candidats ne le sont pas. Quel est le meilleur repère de décision ?',
  '["La disponibilité familiale supposée", "Des critères identiques, liés aux exigences concrètes du poste", "L’âge des enfants éventuels", "La proximité du domicile uniquement"]',
  1,
  'Des questions et critères cohérents, professionnels et appliqués à tout le monde limitent les décisions fondées sur des suppositions relatives à la vie privée.',
  'Biais liés à la vie privée et familiale',
  6
),
(
  'Un responsable refuse à une ingénieure une mission de terrain en disant vouloir la protéger d’un environnement difficile, sans évaluation individuelle du risque. Quel est le problème principal ?',
  '["La mission de terrain est toujours sans risque", "La protection devient une mise sous tutelle lorsqu’elle retire un choix sur la base du genre", "Toute mesure de prévention est discriminatoire", "L’ingénieure doit accepter toutes les missions"]',
  1,
  'La prévention doit reposer sur les risques du poste et s’appliquer de façon cohérente. Une protection imposée à un groupe peut fermer des parcours professionnels.',
  'Paternalisme protecteur et tutelle',
  7
),
(
  'Pendant une négociation, un collègue répond à la place d’une experte en affirmant que le sujet est trop conflictuel pour elle. Quelle intervention soutient son autonomie ?',
  '["Lui demander directement si elle souhaite répondre et lui laisser la parole", "Répondre à sa place plus fermement", "Quitter immédiatement la réunion", "Présumer qu’elle est d’accord avec le collègue"]',
  0,
  'Restituer la parole et le choix à la personne évite de remplacer une tutelle par une autre, tout en corrigeant la dynamique de l’échange.',
  'Paternalisme protecteur et tutelle',
  8
),
(
  'Deux responsables donnent la même consigne ferme. L’homme est décrit comme « exigeant », la femme comme « agressive ». Quelle méthode aide à corriger ce double standard ?',
  '["Interdire tout retour sur le style de management", "Comparer des comportements observables et leurs effets avec les mêmes critères", "Employer des adjectifs encore plus forts", "Évaluer uniquement la popularité"]',
  1,
  'Décrire des faits précis et appliquer une grille commune réduit le risque que le même comportement soit interprété différemment selon le genre.',
  'Doubles standards et intimidation',
  9
),
(
  'Une collaboratrice négocie son salaire et on lui reproche son manque de modestie, alors qu’une démarche semblable est valorisée chez un collègue. Quelle réponse managériale est la plus juste ?',
  '["Décourager toute négociation individuelle", "Examiner la demande avec une grille salariale transparente et les mêmes données", "Lui demander d’adopter un ton plus reconnaissant avant toute discussion", "Décider selon l’assurance perçue"]',
  1,
  'Des fourchettes, critères et données comparables permettent d’évaluer la demande sans pénaliser une personne pour avoir transgressé une attente de modestie.',
  'Doubles standards et intimidation',
  10
),
(
  'Lors d’une réunion, les propositions d’une participante sont régulièrement interrompues avant leur conclusion. Quel rôle peut jouer la personne qui anime ?',
  '["Attendre que la participante parle plus fort", "Faire terminer chaque intervention et suivre les tours de parole", "Réduire uniquement son temps de parole", "Supprimer le compte rendu"]',
  1,
  'Une règle de parole appliquée à tous agit sur la structure de la réunion plutôt que de demander à la personne interrompue de compenser seule.',
  'Interruption et monopole de l’espace sonore',
  11
),
(
  'Une personne occupe une grande partie du temps de réunion, reformule chaque réponse et coupe plusieurs collègues. Quel indicateur est le plus utile avant d’intervenir ?',
  '["Le volume sonore seulement", "La répartition du temps de parole et la fréquence des interruptions", "Le nombre de diapositives", "L’ancienneté de la personne uniquement"]',
  1,
  'Observer le temps et les interruptions fournit des faits discutables collectivement. Parler longtemps n’est pas en soi fautif, mais une répartition déséquilibrée peut empêcher la contribution des autres.',
  'Interruption et monopole de l’espace sonore',
  12
),
(
  'Une analyste expose une idée qui reçoit peu de réactions. Dix minutes plus tard, un collègue la reprend et elle est saluée comme nouvelle. Quelle intervention est constructive ?',
  '["Accuser immédiatement le collègue de vol intentionnel", "Relier clairement la proposition à l’intervention initiale de l’analyste", "Ne rien dire pour préserver l’ambiance", "Attribuer l’idée à toute l’entreprise"]',
  1,
  'Rétablir factuellement la chronologie rend la contribution visible sans avoir besoin de conclure sur l’intention du collègue.',
  'Appropriation et invisibilisation',
  13
),
(
  'Le bilan d’un projet cite le présentateur final mais omet la personne qui a conçu la méthode utilisée. Quelle pratique prévient cette invisibilisation ?',
  '["Ne nommer personne dans aucun document", "Documenter les contributions et vérifier les crédits avec l’équipe", "Créditer seulement la personne la plus senior", "Alterner les noms au hasard"]',
  1,
  'Une trace partagée des rôles et livrables rend l’attribution moins dépendante de la visibilité en réunion ou du statut hiérarchique.',
  'Appropriation et invisibilisation',
  14
),
(
  'Une experte est systématiquement présentée par son prénom, tandis que les hommes du même panel le sont avec leur titre professionnel. Quel ajustement est approprié ?',
  '["Retirer tous les noms", "Choisir une convention de présentation cohérente pour toutes les personnes", "Ajouter l’âge des intervenants", "Conserver la différence si elle semble amicale"]',
  1,
  'Une convention homogène évite de signaler implicitement que certaines expertises seraient moins institutionnelles ou moins légitimes.',
  'Appropriation et invisibilisation',
  15
),
(
  'Après un congé parental, une salariée ne reçoit plus de dossiers stratégiques car son manager veut lui laisser « le temps de se remettre dans le rythme ». Quelle approche respecte mieux son parcours ?',
  '["Maintenir durablement des missions allégées sans discussion", "Organiser un échange sur ses objectifs, ses besoins éventuels et des critères d’attribution communs", "Lui demander de prouver seule sa disponibilité en travaillant tard", "Attendre un an avant tout projet important"]',
  1,
  'Un dialogue explicite permet un accompagnement adapté sans transformer une attention supposée bienveillante en frein de carrière.',
  'Biais liés à la vie privée et familiale',
  16
),
(
  'Dans les évaluations, les femmes reçoivent surtout des commentaires sur l’entraide, tandis que les hommes reçoivent davantage de conseils techniques et stratégiques. Quel audit est pertinent ?',
  '["Compter la longueur des évaluations uniquement", "Comparer la nature, la précision et l’utilité professionnelle des retours selon les groupes", "Supprimer les retours positifs", "Évaluer les personnes sans aucun texte"]',
  1,
  'La qualité du retour compte autant que sa tonalité. Des conseils moins actionnables peuvent limiter la progression même lorsque l’évaluation paraît positive.',
  'Travail domestique invisible au bureau',
  17
),
(
  'Une cheffe de projet est qualifiée d’intimidante parce qu’elle demande des échéances précises. Quelle question permet de distinguer exigence légitime et comportement problématique ?',
  '["Est-elle appréciée de tout le monde ?", "Quels actes observables, quel contexte et quels effets seraient jugés de la même façon chez un autre responsable ?", "Sourit-elle pendant chaque demande ?", "A-t-elle une voix grave ?"]',
  1,
  'L’analyse de faits, du contexte et d’un standard comparable évite à la fois de banaliser un comportement nocif et d’appliquer un double standard.',
  'Doubles standards et intimidation',
  18
),
(
  'Une collègue signale calmement qu’elle a été interrompue. On lui répond qu’elle est « trop sensible ». Quelle réponse ouvre un examen utile de la situation ?',
  '["Discuter des interruptions observées et convenir d’une règle commune", "Débattre de sa personnalité", "Lui conseiller de ne plus participer", "Classer le sujet sans observation"]',
  0,
  'Déplacer la discussion de la personnalité vers les comportements vérifiables permet de traiter le fonctionnement collectif sans invalider le ressenti exprimé.',
  'Interruption et monopole de l’espace sonore',
  19
),
(
  'Une organisation veut vérifier si les contributions des femmes deviennent moins visibles au fil d’un projet. Quelle combinaison de données est la plus informative ?',
  '["Uniquement la photo finale de l’équipe", "Les auteurs des propositions, les rôles réalisés, les prises de parole et les crédits finaux", "Seulement le nombre d’heures au bureau", "Les impressions d’une seule personne"]',
  1,
  'Suivre plusieurs étapes permet de repérer où une contribution perd sa visibilité, tout en évitant de déduire une cause à partir d’un seul indicateur.',
  'Appropriation et invisibilisation',
  20
);

INSERT INTO resources (name, description, url, phone, resource_type, sort_order) VALUES
(
  'Violences Femmes Info',
  'Le 3919 écoute, informe et oriente les femmes victimes de violences ainsi que leur entourage. Ce numéro national n’est pas un service d’urgence.',
  'https://www.solidaritefemmes.org/appeler-le-3919',
  '3919',
  'écoute et orientation',
  1
),
(
  'Arrêtons les violences',
  'Portail officiel proposant des informations, des contacts et un accès au signalement en ligne auprès des forces de l’ordre.',
  'https://arretonslesviolences.gouv.fr/',
  NULL,
  'information officielle',
  2
),
(
  'Défenseur des droits',
  'Autorité indépendante pouvant informer et accompagner les personnes estimant subir une discrimination, notamment dans l’emploi.',
  'https://www.defenseurdesdroits.fr/',
  '3928',
  'droits et discriminations',
  3
),
(
  'AVFT',
  'Association européenne contre les violences faites aux femmes au travail, proposant information et accompagnement dans son champ d’intervention.',
  'https://www.avft.org/',
  NULL,
  'accompagnement spécialisé au travail',
  4
),
(
  'France Victimes',
  'Le 116 006 informe et oriente les victimes vers une association d’aide aux victimes proche de chez elles.',
  'https://www.france-victimes.fr/',
  '116 006',
  'aide aux victimes',
  5
);
