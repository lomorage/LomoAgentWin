set zip_file=%1
echo %zip_file%
set tag=zip
hub release delete %tag%
hub release create -a %zip_file% -m "latest release" %tag%