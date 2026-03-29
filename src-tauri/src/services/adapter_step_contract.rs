use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::error::AppError;
use crate::services::script_runner::ScriptRuntime;
use crate::shared::manifest::RunManifest;

#[derive(Debug, Clone, Copy)]
pub struct AdapterStepBinding {
    pub manifest_step_id: &'static str,
    pub action_id: &'static str,
    pub progress_label: &'static str,
}

#[derive(Debug, Clone)]
pub struct PlannedAdapterStep {
    pub manifest_step_id: String,
    pub action_id: String,
    pub progress_label: String,
}

#[derive(Debug, Clone, Copy)]
pub struct ScriptedPipelineContract {
    pub pipeline_id: &'static str,
    pub runtime: ScriptRuntime,
    pub script_relative_path: &'static str,
    pub steps: &'static [AdapterStepBinding],
}

impl ScriptedPipelineContract {
    pub fn script_path(self) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(self.script_relative_path)
    }

    pub fn plan_steps(self, manifest: &RunManifest) -> Result<Vec<PlannedAdapterStep>, AppError> {
        if manifest.pipeline.pipeline_id != self.pipeline_id {
            return Err(AppError::Config(format!(
                "pipeline contract mismatch: manifest pipeline '{}' does not match contract '{}'",
                manifest.pipeline.pipeline_id, self.pipeline_id
            )));
        }

        let known = self
            .steps
            .iter()
            .map(|step| (step.manifest_step_id, step))
            .collect::<BTreeMap<_, _>>();

        let mut planned: Vec<PlannedAdapterStep> =
            Vec::with_capacity(manifest.execution_plan.stages.len());
        for stage in &manifest.execution_plan.stages {
            let Some(binding) = known.get(stage.step_id.as_str()) else {
                return Err(AppError::Config(format!(
                    "no executable action mapping for manifest step '{}' in pipeline '{}'",
                    stage.step_id, self.pipeline_id
                )));
            };
            planned.push(PlannedAdapterStep {
                manifest_step_id: stage.step_id.clone(),
                action_id: binding.action_id.to_string(),
                progress_label: binding.progress_label.to_string(),
            });
        }
        Ok(planned)
    }
}
