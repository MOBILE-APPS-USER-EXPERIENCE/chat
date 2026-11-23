import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Input, Label, Spinner, Text, XStack, YStack } from "tamagui";

import Header from "@/components/header";
import OptionSelect from "@/components/option-select";
import { FontSize, Spacing } from "@/config/layout";
import { useLearningStatus } from "@/hooks/use-learning-status";
import {
  isProgressMissing,
  MAX_PROGRESS_LENGTH,
  STUDY_MODULES,
  STUDY_PROGRAMS,
  toLearningStatus,
  type LearningStatus,
  type StudyModule,
  type StudyProgram,
} from "@/utils/learning-status";

const SUCCESS_DELAY_MS = 1200;

type SaveState = "idle" | "saving" | "saved" | "failed";

function goBackToExamPhase() {
  if (router.canGoBack()) router.back();
  else router.replace("/exam-phase");
}

function LearningStatusForm({
  initial,
  save,
}: Readonly<{
  initial: LearningStatus | null;
  save: (status: LearningStatus) => Promise<void>;
}>) {
  const [studyProgram, setStudyProgram] = useState<StudyProgram | null>(
    initial?.studyProgram ?? null,
  );
  const [module, setModule] = useState<StudyModule | null>(
    initial?.module ?? null,
  );
  const [progress, setProgress] = useState(initial?.progress ?? "");
  const [progressTouched, setProgressTouched] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const status = toLearningStatus({ studyProgram, module, progress });
  const busy = saveState === "saving" || saveState === "saved";
  const showProgressError = progressTouched && isProgressMissing(progress);

  // Show the success message briefly, then return to "Prüfungsphase".
  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = setTimeout(goBackToExamPhase, SUCCESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [saveState]);

  async function handleSave() {
    if (status === null || busy) return;
    setSaveState("saving");
    try {
      await save(status);
      setSaveState("saved");
    } catch (caughtError) {
      console.warn("Saving the learning status failed.", caughtError);
      setSaveState("failed");
    }
  }

  return (
    <YStack px={Spacing.four} gap={Spacing.four}>
      <YStack gap={Spacing.two}>
        <Label htmlFor="study-program">Studiengang</Label>
        <OptionSelect
          id="study-program"
          value={studyProgram}
          options={STUDY_PROGRAMS}
          placeholder="Studiengang auswählen"
          disabled={busy}
          onValueChange={setStudyProgram}
        />
      </YStack>

      <YStack gap={Spacing.two}>
        <Label htmlFor="study-module">Modul</Label>
        <OptionSelect
          id="study-module"
          value={module}
          options={STUDY_MODULES}
          placeholder="Modul auswählen"
          disabled={busy || studyProgram === null}
          onValueChange={setModule}
        />
        {studyProgram === null && (
          <Text color="textSecondary" fontSize={FontSize.small}>
            Wähle zuerst einen Studiengang.
          </Text>
        )}
      </YStack>

      <YStack gap={Spacing.two}>
        <Label htmlFor="progress">Aktueller Stand</Label>
        <Input
          id="progress"
          value={progress}
          onChangeText={(text) => {
            setProgress(text);
            setProgressTouched(true);
          }}
          onBlur={() => setProgressTouched(true)}
          maxLength={MAX_PROGRESS_LENGTH}
          placeholder="z. B. Kapitel 3, Übungsblatt 2"
          borderColor={showProgressError ? "error" : "backgroundSelected"}
          color="text"
          placeholderTextColor="textSecondary"
          h={Spacing.inputHeight}
          disabled={busy}
        />
        <XStack justify="space-between" gap={Spacing.two}>
          <Text color="error" fontSize={FontSize.small}>
            {showProgressError ? "Bitte ausfüllen" : ""}
          </Text>
          <Text color="textSecondary" fontSize={FontSize.small}>
            {progress.length} / {MAX_PROGRESS_LENGTH}
          </Text>
        </XStack>
      </YStack>

      <Text color="textSecondary" fontSize={FontSize.small}>
        Dein Lernstatus wird für die Lernräume in der Prüfungsphase verwendet.
      </Text>

      {saveState === "failed" && (
        <YStack gap={Spacing.two}>
          <Text color="error">Lernstatus konnte nicht gespeichert werden.</Text>
          <Button
            h={Spacing.inputHeight}
            onPress={() => void handleSave()}
          >
            Erneut versuchen
          </Button>
        </YStack>
      )}

      {saveState === "saved" && <Text color="text">Lernstatus gespeichert</Text>}

      <Button
        disabled={status === null || busy}
        onPress={() => void handleSave()}
        h={Spacing.inputHeight}
      >
        {saveState === "saving" ? <Spinner color="text" /> : "Speichern"}
      </Button>
    </YStack>
  );
}

export default function LearningStatusScreen() {
  const { status, loading, error, save } = useLearningStatus();

  return (
    <YStack flex={1} backgroundColor="background">
      <Header title="Lernstatus setzen" />
      {loading ? (
        <YStack flex={1} items="center" justify="center">
          <Spinner size="large" color="accent" />
        </YStack>
      ) : (
        <>
          {!!error && (
            <Text color="error" px={Spacing.four}>
              {error}
            </Text>
          )}
          {/* Mounted only after loading, so the saved values prefill the form. */}
          <LearningStatusForm initial={status} save={save} />
        </>
      )}
    </YStack>
  );
}
