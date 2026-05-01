{{/*
Expand the name of the chart.
*/}}
{{- define "erasegraph.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "erasegraph.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "erasegraph.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
Selector labels for a given app name (pass as second argument).
Usage: {{ include "erasegraph.selectorLabels" (list . "backend") }}
*/}}
{{- define "erasegraph.selectorLabels" -}}
{{- $ctx := index . 0 -}}
{{- $app := index . 1 -}}
app: {{ $app }}
app.kubernetes.io/name: {{ $app }}
app.kubernetes.io/instance: {{ $ctx.Release.Name }}
{{- end }}

{{/*
Build the full image reference for an application service.
Usage: {{ include "erasegraph.appImage" (list . "infra-backend") }}
*/}}
{{- define "erasegraph.appImage" -}}
{{- $values := index . 0 -}}
{{- $imageName := index . 1 -}}
{{- printf "%s:%s" $imageName $values.Values.images.tag }}
{{- end }}
