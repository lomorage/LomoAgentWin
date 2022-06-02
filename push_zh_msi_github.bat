set msi_file=h:\myproject\lomoware\lomo-win\src\msi\zh-CN\lomoagent.msi
set tag=zh
hub release delete %tag%
hub release create -a %msi_file% -m "latest release" %tag%