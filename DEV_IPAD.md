# Testar a aplicação em dev no iPad físico

Passo a passo para rodar o Coldigom (backend no Mac + app Flutter) e testar no iPad na mesma rede.

---

## 1. Pré-requisitos

- **Mac** com Xcode 15+ e Flutter 3.38+
- **iPad** na mesma rede Wi‑Fi que o Mac
- **Cabo USB** (opcional; também dá para usar “Connect via network” no Xcode)
- **Conta Apple** (gratuita serve; para “Trust” no dispositivo)

No Mac, confira:

```bash
flutter --version
flutter doctor
```

Corrija qualquer item que o `flutter doctor` marcar (Xcode, CocoaPods, etc.).

---

## 2. Descobrir o IP do Mac na rede

O iPad vai acessar a API pelo IP do Mac (ex.: `192.168.1.10`).

No Mac:

```bash
# macOS
ipconfig getifaddr en0
```

Se usar Wi‑Fi em outra interface (en1, etc.), ajuste. Anote o IP (ex.: `192.168.1.10`).

---

## 3. Subir o backend em dev

Na raiz do projeto (`coldigom`):

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
docker-compose -f docker-compose.dev.yml up -d
```

Isso sobe PostgreSQL e a API na porta **8000**, escutando em `0.0.0.0` (acessível pelo IP do Mac).

Teste no Mac:

```bash
curl http://127.0.0.1:8000/docs
```

Se quiser rodar o backend **sem Docker** (uvicorn direto), use:

```bash
cd backend
# .env e banco já configurados
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 4. (Opcional) Liberar CORS para o IP do Mac

Se o backend estiver usando uma lista fixa de origens (ex. no `.env`), inclua o IP do Mac. No `.env` na raiz do projeto:

```env
CORS_ORIGINS=http://localhost:3000,http://localhost,http://127.0.0.1:8000,http://SEU_IP_MAC:8000
```

Substitua `SEU_IP_MAC` pelo IP anotado (ex.: `192.168.1.10`). Se já estiver `*`, não precisa mudar.

---

## 5. Conectar o iPad e confiar no desenvolvedor

1. Conecte o iPad ao Mac via USB (ou use “Connect via network” no Xcode depois da primeira vez).
2. No iPad: **Ajustes → Geral → VPN e gestão do dispositivo** (ou **Perfil e gestão do dispositivo**).
3. Toque no “desenvolvedor” (seu Apple ID) e toque em **Confiar**.

Se for a primeira vez com este Mac, o iPad pode pedir “Confiar neste computador?” — confirme.

---

## 6. Listar dispositivos e escolher o iPad

No Mac:

```bash
flutter devices
```

Anote o **id** do iPad (ex.: `00008103-001234567890001E`).

---

## 7. Rodar o app Flutter apontando para o Mac

O app no iPad precisa usar o **IP do Mac** como base da API (não `localhost`). No **dispositivo físico**, variáveis de ambiente do terminal não chegam ao app — use `--dart-define` para a URL ser embutida no build.

Substitua `SEU_IP_MAC` pelo IP anotado (ex.: `192.168.1.10`) e `ID_DO_IPAD` pelo id do passo 6:

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom/frontend-flutter"

flutter run -d ID_DO_IPAD --dart-define=FLUTTER_API_BASE_URL=http://SEU_IP_MAC:8000
```

Exemplo:

```bash
flutter run -d 00008132-001A04680AD9801C --dart-define=FLUTTER_API_BASE_URL=http://192.168.68.82:8000
```

Se houver só um dispositivo conectado, pode omitir `-d <id>`:

```bash
flutter run --dart-define=FLUTTER_API_BASE_URL=http://192.168.68.82:8000
```

O app será instalado e aberto no iPad; no terminal você pode usar **r** (hot reload) e **R** (hot restart). Se alterar a URL, faça **R** (hot restart) para recompilar com o novo valor.

---

## 8. Resumo rápido (depois de configurado)

1. **Backend:** `docker-compose -f docker-compose.dev.yml up -d` (na raiz do projeto).
2. **IP do Mac:** `ipconfig getifaddr en0`.
3. **App no iPad:**  
   `cd frontend-flutter`  
   `flutter run -d <id_do_ipad> --dart-define=FLUTTER_API_BASE_URL=http://<IP_DO_MAC>:8000`

---

## Problemas comuns

- **“Unable to install” / certificado:** Confirme que confiou no desenvolvedor no iPad (passo 5) e que está logado na mesma conta Apple no Xcode (Xcode → Settings → Accounts).
- **App abre mas não carrega dados / Connection refused em 127.0.0.1:** No iPad físico a URL da API precisa ser passada com `--dart-define` (não com variável de ambiente). Use: `flutter run -d <id> --dart-define=FLUTTER_API_BASE_URL=http://<IP_DO_MAC>:8000`. Verifique também se o backend está acessível no Mac (`curl http://SEU_IP:8000/docs`) e se o firewall do Mac permite a porta 8000.
- **HTTP bloqueado no iOS:** O projeto já inclui `NSAppTransportSecurity` no `Info.plist` para permitir HTTP em dev. Se remover isso no futuro, use HTTPS ou exceções ATS apenas para o IP do backend.

---

**Última atualização:** fev 2025
