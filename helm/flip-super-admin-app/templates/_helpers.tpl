{{- define "flip-super-admin-app.name" -}}
flip-super-admin-app
{{- end }}

{{- define "flip-super-admin-app.fullname" -}}
{{ include "flip-super-admin-app.name" . }}
{{- end }}
