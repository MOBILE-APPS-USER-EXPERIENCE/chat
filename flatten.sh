#!/bin/bash
COPY_TARGET="/${PWD##*/}-copy"

rm -rf "..${COPY_TARGET}"
mkdir -p "..${COPY_TARGET}"

# Build rsync exclude arguments
EXCLUDE_ARGS=("--exclude=.git")

cp -r .gitignore .gitignore.tmp
printf '%s\n' '*.png' '*.jpg' '*.jpeg' '*.gif' \
'*.svg' '*.ico' '*.bmp' '.gitignore.tmp' 'flatten.sh' \
>> .gitignore.tmp

[ -f .gitignore.tmp ] && EXCLUDE_ARGS+=("--filter=:- .gitignore.tmp")

rsync -a "${EXCLUDE_ARGS[@]}" ./ "../${COPY_TARGET}/"

rm -f .gitignore.tmp

cd "..${COPY_TARGET}" || exit 1

tree > tree.txt
mkdir -p ./flat
mv tree.txt ./flat/tree.txt

find . -path ./flat -prune -o -type f -print | while IFS= read -r file; do
  newname="${file#./}"
  newname="${newname//\//_}"
  mv "$file" "./flat/$newname"
done

echo "empty because original is to big and irrelevant" > ./flat/package-lock.json
