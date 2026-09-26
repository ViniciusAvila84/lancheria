#!/bin/sh

PROJECT_DIR="/home/dklanches/projetos/dklanches-caixa"
URL="http://localhost:8000"

if ! curl -fsS "$URL" >/dev/null 2>&1; then
    cd "$PROJECT_DIR" || exit 1
    sg lp -c "nohup python3 '$PROJECT_DIR/server.py' > '$PROJECT_DIR/data/server.log' 2>&1 &"
fi

for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "$URL" >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1 &
        exit 0
    fi
    sleep 1
done

printf '%s\n' "Não foi possível iniciar o DkLanches. Consulte data/server.log." >&2
exit 1
