# Bússola Financeira — Relatório de segurança, versão 15

Auditoria e correções feitas sobre a versão 14 (a que está publicada), em 06/11/2026.

**Tipos de teste citados:**
- **Automatizado:** rodou aqui, no Chromium, com a CSP real ligada.
- **Simulado:** rodou contra um clone do seu repositório.
- **Depende do GitHub:** só se confirma depois do envio.

---

## C. Vulnerabilidades encontradas na versão 14

| # | Gravidade | Problema | Correção |
|---|---|---|---|
| 1 | **Crítica** | **Perguntas e histórico à IA iam sem máscara.** Só o contexto financeiro passava pelo mascaramento. Além disso, a autorização para análise e perguntas valia para a sessão inteira (`umaVez`). | Tudo o que sai é mascarado antes do envio: pergunta, histórico, contexto e texto do extrato. A autorização vale para **um** envio e a prévia é **exatamente** o que vai ser transmitido. |
| 2 | **Crítica** | **Abertura sem senha com envelope ilegível.** Quando o envelope criptografado estava ilegível, a função `carregarLocal` desligava o cofre e abria a cópia em texto legível ("fail open"). | **Falha segura.** Aparece uma tela de recuperação; nada é carregado, apagado ou trocado. O cofre continua ligado e a gravação legível fica bloqueada. |
| 3 | **Crítica** | **Bloqueio podia perder dados.** O bloqueio recarregava a página mesmo quando a gravação criptografada tinha falhado, perdendo o que estava só na memória. | O bloqueio só recarrega depois de confirmar a gravação. Se ela falhar, uma tela cobre os dados e oferece "Tentar salvar de novo" e "Exportar backup criptografado". |
| 4 | Alta | **Gravação contada como feita sem conferência.** A gravação criptografada contava como concluída sem reler o resultado, não repetia em falhas temporárias e não distinguia armazenamento cheio, bloqueio do navegador e erro de criptografia. | A fila agora grava, relê e abre o envelope antes de considerar salvo. Ela repete até 3 vezes falhas temporárias (sem duplicar), identifica cada tipo de erro e tenta de novo a cada 30 s. Também avisa antes de fechar a aba com alterações pendentes. |
| 5 | Alta | **"Esqueci a senha" apagava dados.** O botão apagava o envelope e a cópia anterior à restauração. | A recuperação por backup é uma ação expressa e **preserva** o envelope antigo em outra chave, ainda criptografado. O backup volta já protegido por uma senha nova; nunca fica em texto legível. |
| 6 | Média | **Cabeçalho do envelope sem autenticação.** O envelope (versão do formato, parâmetros da chave, sal e IV) não era autenticado. | Envelope **v2**: o cabeçalho inteiro entra como dado autenticado do AES-GCM, e alterar qualquer campo impede a abertura. Envelopes e backups da versão 14 (v1) continuam abrindo. |
| 7 | Média | **Migração podia ficar pela metade.** Se a cópia anterior à restauração falhasse ao ser criptografada, a migração ficava parcial. | A migração foi reordenada: tudo é preparado na memória, gravado e conferido, e só então removido. Qualquer falha desfaz só o que a própria operação gravou. |
| 8 | Média | **Cópia legível apagada sem confirmação.** Depois do desbloqueio, a cópia antiga em texto legível era apagada automaticamente. | Agora só sai com confirmação, e só depois de conferir que o cofre está gravado e íntegro. |
| 9 | Média | **Leitor XLSX com pontos fracos.** Expressões regulares podiam travar com XML malformado; não havia conferência de CRC nem de tamanho real; métodos de compressão e caminhos de arquivo não eram validados. | Leitor linear, sem expressões que voltam atrás. Confere CRC32 e o tamanho real contra o declarado. Recusa ZIP64, caminhos com `..`, nomes duplicados e métodos desconhecidos. Limites por entrada (60 MB), no total (80 MB), de planilhas (100) e de texto por célula (32.767). |
| 10 | Média | **CSP não testada no site publicado.** O "1" vermelho do Console era a própria sonda de teste da CSP, que rodava a cada abertura. | O GitHub agora abre o site num Chrome real e testa a CSP antes e depois de publicar. A sonda só roda quando você pede o teste. |
| 11 | Baixa | **Diagnóstico mostrava "ok" sem testar.** Itens apareciam como aprovados só porque o código existia. | Estados separados: ativa, implementada e desligada, pendente, teste aprovado, teste falhou, teste não executado, não verificada. O botão **Executar testes** roda os autotestes de verdade. |
| 12 | Baixa (defeito) | **Senha atrás da tela de bloqueio.** O pedido de senha abria por trás da tela de bloqueio durante uma recuperação. | Corrigido. |

**Revisados sem novos problemas:**
- **XSS:** revisei os 115 `innerHTML`. Todo conteúdo externo ou do usuário é escapado e todos os links passam por `urlSegura()`. As respostas da IA são escapadas ou mostradas como texto.
- **Segredos:** nenhum no histórico do repositório.
- **Dados pessoais publicados:** nenhum.
- **Workflows:** permissões mínimas e ações fixadas por SHA (detalhes no item D).

**PDF.js:**
- Mantive a **6.4.299**. A mais nova é a 6.5.438, publicada em 01/11/2026, há só 5 dias.
- Nenhuma das duas tem vulnerabilidade conhecida no `npm audit`.
- A falha mais recente do PDF.js (CVE-2026-16633, execução de JavaScript a partir do PDF) foi corrigida na 6.2.108 e **não afeta** a 6.4.299. Ela só ocorre quando a página não tem CSP, e a Bússola tem.
- Também não uso o visualizador nem os scripts do PDF: a Bússola só extrai texto.
- O Dependabot vai propor a atualização quando a nova versão tiver mais tempo de uso.

---

## D. Correções implementadas (resumo)

- **IA:**
  - `autorizarIA` sem reaproveitamento de autorização.
  - Prévia fiel, com as instruções visíveis.
  - Remascaramento do que você editar antes de enviar.
  - Histórico mascarado a cada novo envio.
  - Nenhum envio automático.
- **Cofre:**
  - Envelope v2.
  - Bytes da senha apagados da memória após o uso. Em JavaScript não dá para apagar a própria string da senha; a chave não pode ser exportada e sai da memória no bloqueio.
  - Fila de gravação com conferência e repetição.
  - Bloqueio seguro e tela de bloqueio não concluído.
  - Tela de recuperação.
  - Recuperação por backup que preserva o envelope antigo.
  - Gravação legível proibida sempre que existir envelope.
  - Limpeza de resíduos só com confirmação.
- **XLSX:** leitor linear com os limites do item C.9.
- **CSP:**
  - O workflow recalcula os hashes automaticamente quando o código da página muda.
  - Um `verificar-site.mjs` novo abre a página num Chrome real e confere a CSP, a criptografia, o leitor de planilhas, o armazenamento e o SRI. Ele roda **antes de publicar** (cópia local) e **depois** (endereço publicado), e falha se a CSP bloquear algo legítimo.
- **Diagnóstico:** estados distintos e autotestes reais.

---

## E. Testes executados

| Conjunto | Tipo | Resultado |
|---|---|---|
| **Novos da versão 15:** IA, cofre, gravação, criptografia, XLSX, diagnóstico | automatizado | **44 de 44** |
| Segurança da versão 14 | automatizado | **48 de 48** |
| Regressão geral: carteira, alocação, metas, despesas, receitas, dívidas, relatórios, apuração anual, backup e restauração | automatizado | **62 de 62** |
| Cenário V2 | automatizado | **52 de 52** |
| Dados embutidos do GitHub | automatizado | **11 de 11** |
| Gerador, CSP e segredos (Node) | automatizado | **37 de 37** |
| Selic por período; arquivo local lendo o site | automatizado | aprovados |
| Importação comparada linha a linha com a versão anterior | automatizado | iguais (o .xls em HTML continua lido certo) |
| Arquivo final entregue, no site e aberto do computador | automatizado | PDF com senha e XLSX lidos; 0 violações de CSP; 0 erros |
| Todas as abas no computador e no celular | automatizado | 0 violações de CSP; 0 erros |
| `verificar-site.mjs` na página final | automatizado | aprovado; com hash da CSP adulterado, **reprovou** como esperado |
| Pipeline completo num clone do seu repositório | simulado | aprovado |
| actionlint, com shellcheck, e zizmor nos workflows | automatizado | sem achados |

**Detalhe dos 44 testes novos:**
- **IA:**
  - pergunta com CPF, cartão, CNPJ, conta, agência, e-mail e telefone;
  - histórico com dados pessoais, inclusive na resposta anterior da IA;
  - contexto alterado entre dois envios;
  - nova autorização a cada envio;
  - cancelamento;
  - prévia igual ao conteúdo transmitido (na pergunta, na análise e no extrato);
  - dado pessoal digitado na edição sendo ocultado.
- **Cofre:**
  - envelope ilegível sem nenhuma abertura sem senha;
  - recuperação por backup preservando o envelope antigo;
  - resíduo legível só sai com confirmação;
  - adulteração de parâmetros e do IV;
  - compatibilidade com o envelope da versão 14.
- **Gravação:**
  - armazenamento cheio (erro de quota);
  - falha durante a criptografia;
  - falha de leitura depois de gravar;
  - 60 operações seguidas;
  - bloqueio com gravação falhando (não recarrega);
  - recuperação depois de liberar espaço;
  - bloqueio com gravação pendente;
  - navegador fechado no meio das gravações e reaberto (estado íntegro);
  - migração interrompida no meio;
  - nenhuma cópia legível gravada quando existe envelope.
- **XLSX:**
  - planilha normal;
  - tamanho declarado mentiroso;
  - CRC errado;
  - método de compressão não suportado;
  - caminho `../`;
  - 149 planilhas;
  - 5.000 entradas;
  - nomes duplicados;
  - 300 mil `<row>` sem fechamento (sem travar);
  - ZIP bomb de 120 MB;
  - célula com 50 mil caracteres.
- **Diagnóstico:**
  - mostra "teste não executado" antes de rodar os testes;
  - mostra "teste aprovado" depois.

## I. Testes que não puderam ser feitos aqui

- **CSP e autotestes no endereço publicado:** daqui não consigo acessar o github.io. A verificação está automatizada no workflow e o resultado aparece no passo "Verificar no site publicado".
- **SRI do PDF.js baixado do jsDelivr:** daqui não consigo acessar o jsDelivr. Testei com os arquivos oficiais do npm, que são idênticos aos do jsDelivr, e também com versões adulteradas, que foram recusadas.
- **Workflows rodando no GitHub:** o primeiro envio vai mostrar.
- **Banco de dados em nuvem do Claude:** não auditado. Não tenho acesso às regras de autorização dele, e ele não é usado no site.
- **Integração real com a IA do Claude:** testada com uma IA simulada que registra exatamente o que receberia. O envio real só existe dentro do Claude.
- **Safari e Firefox:** os testes rodaram no Chromium.

---

## F. Pendências externas (as mesmas da versão 14, se ainda não fez)

1. Ligar Dependabot alerts, Secret scanning com Push protection e CodeQL em Settings → Advanced Security.
2. Criar a regra que protege a `main`: bloquear force push e exclusão, **sem** exigir pull request.
3. Em Settings → Actions → General → Workflow permissions, escolher **Read**.
4. Marcar o e-mail como privado nos commits.
5. Não aceitar os 5 pedidos de atualização do Dependabot antes de eu conferir.

**Limite do GitHub Pages:** ele não permite cabeçalhos próprios. Por isso `frame-ancestors` e `Permissions-Policy` não estão disponíveis; isso não está declarado como implementado.

## G. Atualização

Mudaram só 3 arquivos: `index.html`, `.github/workflows/cenario.yml` e o novo `verificar-site.mjs`.

1. Em Add file → Upload files, envie **index.html** e **verificar-site.mjs** juntos.
2. Edite `.github/workflows/cenario.yml` e substitua todo o conteúdo pelo novo.
3. Em Actions, o **Cenário diário** deve terminar verde. Os passos novos são "Testar a página num navegador antes de publicar" e "Verificar no site publicado".

Não há migração manual: os dados e backups atuais continuam valendo. Se a proteção por senha já estiver ligada, o envelope v1 abre normalmente e passa para v2 na próxima gravação.

## H. Preservação dos dados

- **Ao atualizar:** nenhum dado do navegador é alterado.
- **Cofre já ligado (envelope v1):** abre com a mesma senha.
- **Backups:** os criptografados e os sem criptografia da versão 14 continuam sendo aceitos.
- **Cálculos e regras financeiras:** inalterados (62 testes de regressão).
- **Importações:** dão o mesmo resultado da versão anterior.
- **Funcionalidades:** nenhuma foi removida.
