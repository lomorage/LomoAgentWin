set msi_file="h:\myproject\lomoware\lomo-win\src\msi\lomoagent.msi"
set tag=en
hub release delete %tag%
hub release create -a %msi_file% -m "latest release" %tag%