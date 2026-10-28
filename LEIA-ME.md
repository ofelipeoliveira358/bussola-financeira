# Bússola Financeira: cenário diário pelo GitHub

Este pacote publica a Bússola como site (GitHub Pages) e roda, nos dias úteis, um script que busca os dados do mercado e grava o `cenario.json` ao lado da página. **Seus dados pessoais nunca vão para o GitHub**: eles continuam só no navegador de cada aparelho.

## O que vem no pacote

| Arquivo | Para que serve |
|---|---|
| `index.html` | A Bússola. |
| `scripts/gerar-cenario.mjs` | Busca as fontes, valida, preserva o último valor válido e grava `cenario.json`. Se faltar o essencial, não grava nada. |
| `scripts/testar-gerador.mjs` | 16 testes com respostas simuladas. Rodam antes de cada geração; se algum falhar, nada é publicado. |
| `.github/workflows/cenario.yml` | Agenda: dias úteis às 07h27, 12h57 e 18h27 de Brasília, mais um botão para rodar na hora. |

## Fontes usadas pelo script

| Indicador | URL | Formato | Frequência | Limitações conhecidas |
|---|---|---|---|---|
| Selic meta | api.bcb.gov.br · SGS 432 | JSON `[{data, valor}]` | diária (muda no Copom) | traz datas futuras até a próxima reunião; `ultimos/N` aceita até 20 |
| CDI | SGS 4389 | idem | diária | publicado no fim do dia ou no dia seguinte |
| IPCA do mês e 12 meses | SGS 433 e 13522 | idem | mensal | divulgação do IBGE por volta do dia 10 |
| Dólar comercial (fechamento) | SGS 1 | idem | diária | sem cotação intradiária |
| Focus (IPCA e Selic) | olinda.bcb.gov.br · ExpectativasMercadoAnuais | JSON OData | semanal (segunda) | mediana por ano de referência |
| Dólar agora | economia.awesomeapi.com.br | JSON | contínua | serviço privado; cotação indicativa |
| Ibovespa e IFIX | query1.finance.yahoo.com (não oficial) | JSON | contínua | **não oficial**; entra só se a resposta for válida, senão aparece "indisponível" |
| Notícias | RSS do g1 Economia, InfoMoney e Google Notícias | XML | contínua | horários convertidos pelo fuso informado no próprio feed |

Nenhuma fonte usa chave, senha ou serviço intermediário.

## Passo a passo

1. Crie uma conta em **github.com** e um repositório **público** (por exemplo, `bussola-financeira`).
2. Na página do repositório, clique em **Add file → Upload files** e arraste **o conteúdo desta pasta** (`index.html`, a pasta `scripts` e a pasta `.github`). Se o navegador esconder a pasta `.github`, crie o arquivo à mão: **Add file → Create new file**, nome `.github/workflows/cenario.yml`, e cole o conteúdo.
3. **Settings → Pages**: em *Build and deployment*, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`. O endereço será `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.
4. **Settings → Actions → General → Workflow permissions**: marque *Read and write permissions* e salve.
5. **Actions → Cenário diário → Run workflow**. Abra a execução e confira o log: cada fonte aparece como `OK` ou `FALHA` com o motivo. Se der certo, o `cenario.json` aparece no repositório.
6. Abra a Bússola **pelo endereço do site**. No Cenário, em "Fontes e situação", deve aparecer "cenario.json do site gerado em …".
7. No arquivo que você usa hoje: **Seus dados → Exportar backup**. No site: **Importar backup**. Cada endereço guarda os dados separadamente.

## Como saber se está funcionando

- Em **Actions**, as execuções agendadas aparecem com o horário. O GitHub pode atrasar execuções agendadas em alguns minutos.
- Uma execução que falha **não apaga** o `cenario.json` anterior; o log mostra qual fonte falhou.
- Repositórios públicos **sem nenhuma atividade por 60 dias** têm o agendamento suspenso pelo GitHub. Não está confirmado se os commits automáticos do próprio cenário contam como atividade; se aparecer em Actions o aviso de agendamento desativado, clique em *Enable workflow*.
- A análise do dia é montada pela página, com as mesmas regras, a partir dos dados publicados. Não depende de IA nem de chave.
