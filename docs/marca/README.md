# Marca

`logo-colorido.svg` é a arte da marca. Nenhum código a referencia hoje — o
favicon e os ícones da aplicação vivem em `web/public/`, e são arquivos
próprios, bem menores.

Ela estava na raiz do repositório junto de três variantes (`copy`, `copy 2` e
`.bak`), todas com conteúdo diferente entre si — versões distintas do desenho,
não cópias literais. Guardei esta e removi as outras três; se alguma delas era a
canônica, o histórico tem todas:

```
git log --oneline --diff-filter=D -- 'LOGO_COLORIDO*'
git show <commit>^:'LOGO_COLORIDO copy 2.svg' > arte.svg
```
