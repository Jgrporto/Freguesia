Transcricao de audio com Whisper local
======================================

Objetivo
--------
Adicionar um botao "Transcrever audio" abaixo de mensagens de audio no chat. O backend baixa a midia do WhatsApp, executa Whisper local e salva o resultado em message.transcription para que o texto continue visivel apos recarregar a conversa.

Arquivos principais
-------------------
- server/audio-transcription-service.js
- server/whisper-transcribe.py
- server/requirements-whisper.txt
- server/whatsapp-server.js
- src/lib/whatsapp-api.js
- src/components/chat/AudioTranscriptionPanel.jsx
- src/components/chat/ChatMessage.jsx
- src/components/chat/ChatWindow.jsx

Variaveis de ambiente
---------------------
Adicionar no /root/Freguesia/.env:

WHISPER_ENABLED=true
WHISPER_MODEL=base
WHISPER_LANGUAGE=pt
WHISPER_PYTHON_BIN=/opt/freguesia-whisper-venv/bin/python
WHISPER_TMP_DIR=server/data/whisper-tmp
WHISPER_MAX_AUDIO_MB=25
WHISPER_TIMEOUT_MS=180000

Instalacao na VPS
-----------------
apt update
apt install -y ffmpeg python3-venv python3-pip

python3 -m venv /opt/freguesia-whisper-venv
/opt/freguesia-whisper-venv/bin/pip install -U pip
/opt/freguesia-whisper-venv/bin/pip install -r /root/Freguesia/server/requirements-whisper.txt

Validacao local na VPS
----------------------
cd /root/Freguesia
node --check server/whatsapp-server.js
node --check server/audio-transcription-service.js
/opt/freguesia-whisper-venv/bin/python -m py_compile server/whisper-transcribe.py
npm run build

Deploy
------
Como a mudanca altera frontend e backend WhatsApp:

cd /root/Freguesia
git pull --ff-only
npm install
npm run build
rsync -a --delete /root/Freguesia/dist/ /var/www/freguesia/current/
systemctl restart freguesia-whatsapp.service
systemctl is-active freguesia-whatsapp.service

Teste com cliente real
----------------------
1. Abra o painel em https://freguesia.hakione.tech.
2. Entre em uma conversa que tenha uma mensagem de audio recebida.
3. Confirme que o player de audio continua tocando.
4. Clique em "Transcrever audio".
5. Aguarde o estado "Transcrevendo audio..." finalizar.
6. Confirme que o texto aparece abaixo do player.
7. Recarregue a pagina e abra a conversa novamente.
8. Confirme que a transcricao continua aparecendo.

Teste direto de endpoint
------------------------
Use um MESSAGE_ID real da mensagem de audio:

curl -s -X POST "https://freguesia.hakione.tech/api/whatsapp/messages/MESSAGE_ID/transcribe" | python3 -m json.tool

Observacoes operacionais
------------------------
- O processamento e manual por botao, para evitar carga automatica na VPS.
- Audios acima de WHISPER_MAX_AUDIO_MB sao recusados.
- Arquivos temporarios sao removidos ao final do processamento.
- Se o servico reiniciar durante uma transcricao, o estado processing expira pelo WHISPER_TIMEOUT_MS e permite nova tentativa.
