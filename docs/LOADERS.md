# Modloaders des sessions

Une session utilise un seul loader : `forge`, `fabric` ou `neoforge`, avec son
numéro de version. Pour Vanilla, ces champs sont absents ou `null`.

- **Forge** : installation native moderne et installation historique pour
  Minecraft 1.12.2 et les versions antérieures déjà prises en charge.
- **Fabric** : profil officiel Fabric et téléchargement de ses bibliothèques.
  Une erreur HTTP ou d’écriture interrompt la synchronisation.
- **NeoForge** : installateur officiel `net.neoforged:neoforge`, exécution des
  processeurs client et vérification des bibliothèques produites. La version
  Minecraft du profil doit correspondre à celle de la session.

Le lancement Forge/NeoForge avec BootstrapLauncher exclut le JAR client Vanilla
du classpath, contrairement à Fabric. Les versions de loaders ne sont pas
interchangeables : choisir la version publiée pour la version Minecraft utilisée.
Quilt n’a pas d’installateur dans ce parcours ; la synchronisation le signale.

## Changement depuis le tableau de bord

Le formulaire transmet `null` pour les loaders non sélectionnés et vide le numéro
de version lorsqu’on change de famille. L’API remplace toute la sélection dès
qu’un champ de loader est fourni, même par un ancien client qui omet les autres
champs. Une modification sans champ de loader conserve la sélection existante.
L’API refuse plusieurs loaders actifs ; le launcher refuse également une ancienne
configuration ambiguë avant installation ou lancement.

Pour réparer une session déjà enregistrée avec plusieurs loaders, l’ouvrir dans
le tableau de bord, choisir le bon loader et sa version compatible, puis
enregistrer après déploiement du correctif du site. Le choix ne peut pas être
déduit de façon fiable des anciennes valeurs.

## Vérification

Depuis le dépôt du launcher :

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib --offline
cargo test --manifest-path src-tauri/Cargo.toml --test loader_launch_smoke --offline -- --ignored
npm run build
```

Le smoke test nécessite Windows et Java 21. Il prépare des profils isolés,
génère les commandes des trois loaders et vérifie le classpath, les arguments et
la résolution des variables. Il ne démarre pas Minecraft et ne télécharge pas
de modpack. Un essai en jeu reste nécessaire avant publication d’une version.

### Vérification sur le PC du 25 octobre 2026

Les trois sessions locales sans modpack ont été lancées depuis le bouton
« Jouer » du launcher de développement corrigé, avec le compte Minecraft déjà
connecté. Le menu principal a été vérifié visuellement pour chaque loader :

| Minecraft | Loader | Résultat |
| --- | --- | --- |
| 1.20.1 | Fabric 0.17.2 | Menu principal, mention « Fabric (Modded) » |
| 1.20.1 | Forge 47.4.0 | Menu principal, version Forge et deux modules affichés |
| 1.21.1 | NeoForge 21.1.80 | Installation complète puis menu principal, version NeoForge et deux modules affichés |

Le test NeoForge a inclus le téléchargement de Minecraft 1.21.1, de Java 21,
des ressources et l’exécution des processeurs de l’installateur officiel.
Aucune connexion à un serveur ni ouverture de monde n’a été testée. Ces essais
valident les combinaisons ci-dessus, pas toutes les versions historiques.

Depuis le dépôt du site, avec Node.js 24 :

```powershell
node --test src/lib/session-loaders.test.mjs
npx prisma generate
npx tsc --noEmit
npm run build
```
