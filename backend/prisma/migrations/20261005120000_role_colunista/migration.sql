-- O cargo "Jornalista" passa a chamar-se "Colunista". RENAME VALUE muda o
-- nome do valor no tipo, e todas as linhas que o usam (User.role,
-- RolePermissions.role) passam a mostrar o novo nome de uma vez, sem
-- reescrever nenhum dado nem tocar nas permissoes ja guardadas.
ALTER TYPE "Role" RENAME VALUE 'JORNALISTA' TO 'COLUNISTA';
