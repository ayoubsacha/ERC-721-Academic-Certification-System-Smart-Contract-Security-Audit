# Rapport d’audit du contrat Verity

Devoir 2 · Registre de certificats académiques ERC-721 · 19 novembre 2026

## 1. Périmètre

Analyse de `CertificateRegistry.sol` avec OpenZeppelin Contracts 5.4.0 et Solidity 0.8.34. La revue couvre `mintCertificate`, `batchMintCertificates`, `getCertificate`, `tokenURI`, `revokeCertificate` et l’administration des rôles.

## 2. Méthodologie

Revue manuelle des écritures, des rôles et des rappels ERC-721. Vérification des invariants, des événements, des vues publiques et du coût d’un lot maximal pour des destinataires EOA. Tests via Hardhat/Viem et Playwright.

## 3. Checklist de sécurité

| Contrôle | Résultat | Gravité | Éléments vérifiés | Recommandation |
| --- | --- | --- | --- | --- |
| Contrôle d’accès | OK | Élevée | Rôles distincts. Appels non autorisés rejetés. Retrait ou renoncement du dernier administrateur bloqué. | Placer l’administration derrière une gouvernance multisignature hors démonstration. |
| Réentrance et cohérence | OK | Élevée | Garde active et NFT, données, compteur et ID réservés au moment du rappel ERC-721. Annulation complète avec un destinataire incompatible. | Élargir la couverture des interactions de contrats avant production. |
| Double émission | OK | Élevée | ID étudiant canonique et permanent. Doublons rejetés dans un lot, entre transactions et après révocation. | Définir une politique de correction avant tout usage réel. |
| Validation et arithmétique | OK | Moyenne | Longueurs, UTF-8, format d’ID, grade de 0 à 20, date passée ou présente et destinataire non nul. Solidity contrôle les dépassements. | Conserver les validations côté contrat à chaque évolution. |
| Transferts et révocation | OK | Élevée | Transferts et approbations bloqués. Révocation unique, propriété et historique conservés. Événements avec ID indexé. | Tester l’affichage des statuts dans les clients tiers. |
| Coût et disponibilité des lots | Risque | Moyenne | Lot EOA borné à 16 entrées. Un destinataire contractuel peut faire échouer son lot. | Garder des lots petits et examiner les échecs avant une nouvelle soumission. |
| Confidentialité et clés | Risque | Élevée | Les données académiques sont publiques. La protection du dernier rôle ne couvre pas la perte de clés. | Garder des données fictives en testnet et concevoir une stratégie de protection des données et de récupération. |

## 4. Vulnérabilités recherchées

Privilèges excessifs, réentrance, double émission, entrées invalides, dépassements numériques, transferts non autorisés, révocation incohérente et divergence des métadonnées. Aucun défaut critique identifié dans le périmètre et les scénarios exécutés.

## 5. Tests automatisés

- `npm --prefix contracts test` · 30 réussis, 0 échec.
- `npm --prefix contracts run typecheck` · compilation et vérification TypeScript réussies.
- `npm --prefix frontend run lint` et `npm --prefix frontend run build` · réussis.
- `npm --prefix frontend run test:browser` · 10 scénarios réussis avec transactions locales réelles et portefeuille injecté.

## 6. Limites et améliorations

Le test de rappel observe la garde et l’état en lecture. Les écritures imbriquées, le fuzzing, l’extension MetaMask réelle, les clients tiers et Sepolia restent hors de la couverture exécutée. Le test de gaz a utilisé des destinataires EOA sur Hardhat Local. Les clients tiers peuvent conserver un ancien `tokenURI`. Ce rapport relève de la validation pédagogique.
